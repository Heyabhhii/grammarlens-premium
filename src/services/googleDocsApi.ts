/**
 * GrammarLens — Google Docs REST API Service
 *
 * Wraps the Google Docs REST API v1.
 * Handles document fetching, text extraction, index mapping, and fix application.
 *
 * Index mapping
 * ─────────────
 * LanguageTool works with a flat string (offsets from 0).
 * Google Docs uses 1-indexed positions that span the entire document structure,
 * including paragraph end marks and section breaks.
 *
 * GoogleDocsApi.buildIndexMap() returns a Map<ltOffset → docsApiIndex> that
 * enables precise deleteContentRange + insertText requests without using
 * the error-prone replaceAllText approach.
 *
 * Fix strategy (single error)
 * ──────────────────────────
 * 1. deleteContentRange { startIndex, endIndex }  (removes the erroneous text)
 * 2. insertText { index: startIndex, text: replacement }  (inserts the fix)
 * Both are batched in a single batchUpdate call to avoid race conditions.
 */

// ─── API Type Definitions ─────────────────────────────────────────────────────

export interface GDocsTextStyle {
  bold?:          boolean;
  italic?:        boolean;
  underline?:     boolean;
  fontSize?:      { magnitude: number; unit: string };
  foregroundColor?: object;
}

export interface GDocsTextRun {
  content:    string;
  textStyle?: GDocsTextStyle;
}

export interface GDocsParagraphElement {
  startIndex: number;
  endIndex:   number;
  textRun?:   GDocsTextRun;
}

export interface GDocsParagraphStyle {
  namedStyleType?: string;
  alignment?: string;
}

export interface GDocsParagraph {
  elements:        GDocsParagraphElement[];
  paragraphStyle?: GDocsParagraphStyle;
}

export interface GDocsTableCell {
  content:    GDocsStructuralElement[];
  startIndex?: number;
  endIndex?:   number;
}

export interface GDocsTableRow {
  tableCells: GDocsTableCell[];
  startIndex?: number;
  endIndex?:   number;
}

export interface GDocsTable {
  rows:        number;
  columns:     number;
  tableRows:   GDocsTableRow[];
}

export interface GDocsStructuralElement {
  startIndex:    number;
  endIndex:      number;
  paragraph?:    GDocsParagraph;
  sectionBreak?: object;
  table?:        GDocsTable;
  tableOfContents?: object;
}

export interface GDocsBody {
  content: GDocsStructuralElement[];
}

export interface GDocsDocument {
  documentId:  string;
  title?:      string;
  body:        GDocsBody;
  revisionId?: string;
}

// ─── Mapper Result ────────────────────────────────────────────────────────────

export interface GDocsIndexMap {
  /** The flat text extracted from the document (used to build LT request) */
  flatText: string;
  /**
   * Maps flat-text character index (0-based) → Google Docs API index (1-based).
   * Only contains entries for real text characters (not paragraph marks).
   */
  ltToApiIndex: Map<number, number>;
}

// ─── Error Types ─────────────────────────────────────────────────────────────

export class GDocsApiError extends Error {
  constructor(
    public readonly status:    number,
    public readonly detail:    string,
    public readonly retryable: boolean = false
  ) {
    super(`Google Docs API error ${status}: ${detail}`);
    this.name = 'GDocsApiError';
  }
}

// ─── GoogleDocsApi ────────────────────────────────────────────────────────────

const BASE_URL = 'https://docs.googleapis.com/v1/documents';

export class GoogleDocsApi {
  // ── Document Read ──────────────────────────────────────────────────────────

  /**
   * Fetch the full document structure from the Google Docs API.
   * Required for precise index-based fix application.
   */
  async getDocument(docId: string, token: string): Promise<GDocsDocument> {
    const url      = `${BASE_URL}/${encodeURIComponent(docId)}`;
    const response = await this.request(url, 'GET', null, token);
    return response as GDocsDocument;
  }

  // ── Index Mapping ──────────────────────────────────────────────────────────

  /**
   * Build a flat-text string from a GDocsDocument and a Map that translates
   * flat-text character indices (0-based) to Google Docs API indices (1-based).
   *
   * Paragraph end marks ("\n" appended by the API to each paragraph) are
   * tracked as virtual separators and are NOT included in flatText. This
   * keeps the LT-submitted text clean of trailing paragraph newlines while
   * ensuring character positions remain accurate.
   */
  buildIndexMap(doc: GDocsDocument): GDocsIndexMap {
    const ltToApiIndex = new Map<number, number>();
    let   flatText     = '';

    const processElements = (elements: GDocsStructuralElement[]): void => {
      for (const el of elements) {
        if (el.paragraph) {
          for (const elem of el.paragraph.elements) {
            const content = elem.textRun?.content;
            if (!content) continue;

            // The last character of a textRun in a paragraph is typically "\n"
            // (paragraph end mark). We include it in flatText as a separator
            // so LT sees correct paragraph boundaries.
            for (let i = 0; i < content.length; i++) {
              const ch     = content[i];
              if (ch === undefined) continue;
              const apiIdx = elem.startIndex + i;

              ltToApiIndex.set(flatText.length, apiIdx);
              flatText += ch;
            }
          }
        } else if (el.table) {
          for (const row of el.table.tableRows) {
            for (const cell of row.tableCells) {
              processElements(cell.content);
            }
          }
        }
      }
    };

    processElements(doc.body.content);

    return { flatText, ltToApiIndex };
  }

  /**
   * Resolve a LanguageTool flat-text offset to a Google Docs API index.
   * Falls back to (offset + 1) if the offset isn't in the map (1-indexed shift).
   */
  ltOffsetToApiIndex(indexMap: GDocsIndexMap, ltOffset: number): number {
    return indexMap.ltToApiIndex.get(ltOffset) ?? ltOffset + 1;
  }

  // ── Fix Application ────────────────────────────────────────────────────────

  /**
   * Apply a single text correction to the document via batchUpdate.
   *
   * The fix is performed as two atomic operations (single API call):
   *   1. deleteContentRange  — removes the erroneous text
   *   2. insertText          — inserts the replacement at the same position
   *
   * @param docId       Google Docs document ID
   * @param token       OAuth access token
   * @param startApiIdx Start index (inclusive, 1-based) from GDocsIndexMap
   * @param endApiIdx   End index (exclusive, 1-based) — startApiIdx + errorLength
   * @param replacement Corrected text
   */
  async applyFix(
    docId:       string,
    token:       string,
    startApiIdx: number,
    endApiIdx:   number,
    replacement: string
  ): Promise<void> {
    const requests = [
      {
        deleteContentRange: {
          range: {
            startIndex: startApiIdx,
            endIndex:   endApiIdx,
            segmentId:  '',
          },
        },
      },
      {
        insertText: {
          location: {
            index:     startApiIdx,
            segmentId: '',
          },
          text: replacement,
        },
      },
    ];

    await this.batchUpdate(docId, token, requests);
  }

  /**
   * Send a batchUpdate request to the Google Docs API.
   * Handles token expiry (401) by throwing a retryable GDocsApiError.
   */
  async batchUpdate(
    docId:    string,
    token:    string,
    requests: object[]
  ): Promise<void> {
    const url  = `${BASE_URL}/${encodeURIComponent(docId)}:batchUpdate`;
    await this.request(url, 'POST', { requests }, token);
  }

  // ── Private: HTTP Layer ────────────────────────────────────────────────────

  private async request(
    url:    string,
    method: 'GET' | 'POST',
    body:   object | null,
    token:  string
  ): Promise<unknown> {
    const init: RequestInit = {
      method,
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };
    if (body !== null) init.body = JSON.stringify(body);

    const response = await fetch(url, init);

    if (response.ok) {
      // batchUpdate returns 200 with empty body; getDocument returns JSON
      const text = await response.text();
      return text.length > 0 ? JSON.parse(text) as unknown : {};
    }

    const detail = await response.text().catch(() => '');

    if (response.status === 401) {
      throw new GDocsApiError(401, 'Token expired or invalid. Re-authentication required.', true);
    }
    if (response.status === 403) {
      throw new GDocsApiError(403, `Permission denied. Ensure the 'documents' scope is granted. ${detail}`, false);
    }
    if (response.status === 404) {
      throw new GDocsApiError(404, `Document not found: ${url}`, false);
    }
    if (response.status >= 500) {
      throw new GDocsApiError(response.status, `Google server error. ${detail}`, true);
    }

    throw new GDocsApiError(response.status, detail, false);
  }
}

/** Shared singleton used by the background service worker. */
export const googleDocsApi = new GoogleDocsApi();
