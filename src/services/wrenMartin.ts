/**
 * GrammarLens — Wren & Martin Grammar Rule Database
 *
 * Maps LanguageTool rule IDs to Wren & Martin chapter references,
 * plain-English explanations, correct/incorrect examples, and difficulty levels.
 *
 * Reference: "High School English Grammar & Composition" by P.C. Wren & H. Martin
 */

import type { WrenMartinExplanation, DifficultyLevel } from '../types/grammar.js';

const RULE_DATABASE: Record<string, WrenMartinExplanation> = {
  EN_A_VS_AN: {
    rule: 'Use of "a" vs "an"',
    chapter: 'Chapter 1: The Article',
    explanation: 'Use "an" before words that begin with a vowel sound. Use "a" before words beginning with a consonant sound. It is the sound, not the spelling, that matters.',
    correctExample: 'She ate an apple and a banana.',
    incorrectExample: 'She ate a apple and an banana.',
    difficulty: 'beginner',
  },
  WHO_WHOM: {
    rule: 'Who vs. Whom',
    chapter: 'Chapter 7: Pronouns',
    explanation: 'Use "who" as the subject of a verb. Use "whom" as the object of a verb or preposition. Replace with "he/she" to test for who, "him/her" for whom.',
    correctExample: 'Whom did you call? / Who called you?',
    incorrectExample: 'Who did you call? / Whom called you?',
    difficulty: 'intermediate',
  },
  PRONOUN_AGREEMENT: {
    rule: 'Pronoun–Antecedent Agreement',
    chapter: 'Chapter 7: Pronouns',
    explanation: 'A pronoun must agree with its antecedent in number and gender. Singular antecedents take singular pronouns; plural antecedents take plural pronouns.',
    correctExample: 'Every student must bring his or her textbook.',
    incorrectExample: 'Every student must bring their textbook. (in formal writing)',
    difficulty: 'intermediate',
  },
  MYSELF_USED_INCORRECTLY: {
    rule: 'Reflexive Pronoun Misuse',
    chapter: 'Chapter 7: Pronouns',
    explanation: '"Myself" and other -self/-selves pronouns are used reflexively or for emphasis only. They cannot replace "me" or "I" as a subject or object.',
    correctExample: 'I did it myself. / Please contact John or me.',
    incorrectExample: 'Please contact John or myself.',
    difficulty: 'intermediate',
  },
  FEWER_LESS: {
    rule: '"Fewer" vs. "Less"',
    chapter: 'Chapter 6: Adjectives',
    explanation: 'Use "fewer" with countable nouns (things you can count). Use "less" with uncountable nouns (mass nouns or abstract quantities).',
    correctExample: 'Fewer mistakes lead to less stress.',
    incorrectExample: 'Less mistakes lead to fewer stress.',
    difficulty: 'intermediate',
  },
  GOOD_WELL: {
    rule: '"Good" vs. "Well"',
    chapter: 'Chapter 8: Adverbs',
    explanation: '"Good" is an adjective modifying nouns. "Well" is usually an adverb modifying verbs. After linking verbs (feel, look, seem), "good" is correct.',
    correctExample: 'She sings well. / That smells good.',
    incorrectExample: 'She sings good. / That smells well.',
    difficulty: 'beginner',
  },
  COMPARATIVE_ADJECTIVE: {
    rule: 'Incorrect Comparative Form',
    chapter: 'Chapter 6: Adjectives — Degrees of Comparison',
    explanation: 'One-syllable adjectives add -er for comparatives. Most three-syllable adjectives use "more". Never combine both forms (e.g. "more taller").',
    correctExample: 'She is taller and more intelligent than her sister.',
    incorrectExample: 'She is more tall and intelligenter than her sister.',
    difficulty: 'beginner',
  },
  BETWEEN_AMONG: {
    rule: '"Between" vs. "Among"',
    chapter: 'Chapter 9: Prepositions',
    explanation: 'Use "between" for two people or things. Use "among" for three or more.',
    correctExample: 'Divide it between the two partners. / Divide it among the five members.',
    incorrectExample: 'Divide it among the two partners.',
    difficulty: 'beginner',
  },
  IN_ON_AT_TIME: {
    rule: 'Prepositions of Time',
    chapter: 'Chapter 9: Prepositions',
    explanation: 'Use "at" for specific times (at 5 pm), "on" for days and dates (on Monday), and "in" for longer periods (in June, in 2024).',
    correctExample: 'The meeting is at 3 pm on Monday in January.',
    incorrectExample: 'The meeting is in 3 pm at Monday on January.',
    difficulty: 'beginner',
  },
  SUBJECT_VERB_AGREEMENT: {
    rule: 'Subject–Verb Agreement',
    chapter: 'Chapter 24: Concord (Agreement)',
    explanation: 'A verb must agree with its subject in number. Do not be misled by phrases that come between the subject and the verb.',
    correctExample: 'The box of chocolates is on the table. / The students are studying.',
    incorrectExample: 'The box of chocolates are on the table.',
    difficulty: 'intermediate',
  },
  EITHER_NOR_AGREEMENT: {
    rule: 'Neither/Either … Nor/Or Agreement',
    chapter: 'Chapter 24: Concord (Agreement)',
    explanation: 'With "neither…nor" or "either…or", the verb agrees with the subject closest to it (proximate agreement rule).',
    correctExample: 'Neither the manager nor the employees are responsible.',
    incorrectExample: 'Neither the manager nor the employees is responsible.',
    difficulty: 'advanced',
  },
  PAST_PERFECT_REQUIRED: {
    rule: 'Past Perfect Tense',
    chapter: 'Chapter 14: Tenses',
    explanation: 'Use the past perfect (had + past participle) for an action completed before another past action.',
    correctExample: 'She had finished lunch before he arrived.',
    incorrectExample: 'She finished lunch before he arrived. (when sequence matters)',
    difficulty: 'intermediate',
  },
  PRESENT_PERFECT_SIMPLE_PAST: {
    rule: 'Present Perfect vs. Simple Past',
    chapter: 'Chapter 14: Tenses',
    explanation: 'Use the present perfect for actions with a connection to the present. Use the simple past for completed actions at a specific past time.',
    correctExample: 'I have seen that film (recently). / I saw that film last week.',
    incorrectExample: 'I have seen that film last week.',
    difficulty: 'intermediate',
  },
  PASSIVE_VOICE: {
    rule: 'Passive Voice',
    chapter: 'Chapter 21: Active and Passive Voice',
    explanation: 'Prefer active voice for clearer, more direct writing. Passive voice can obscure responsibility and results in wordier sentences.',
    correctExample: 'The manager approved the report.',
    incorrectExample: 'The report was approved by the manager.',
    difficulty: 'intermediate',
  },
  SUBJUNCTIVE_MOOD: {
    rule: 'Subjunctive Mood',
    chapter: 'Chapter 22: The Mood',
    explanation: 'The subjunctive expresses hypothetical or contrary-to-fact conditions. Use "were" (not "was") for all persons in such clauses.',
    correctExample: 'If I were you, I would apologise. / I wish she were here.',
    incorrectExample: 'If I was you, I would apologise.',
    difficulty: 'advanced',
  },
  COMMA_COMPOUND_SENTENCE: {
    rule: 'Comma in Compound Sentences',
    chapter: 'Chapter 27: Punctuation — The Comma',
    explanation: 'When two independent clauses are joined by a coordinating conjunction (and, but, or, nor, for, yet, so), place a comma before the conjunction.',
    correctExample: 'She studied hard, and she passed the exam.',
    incorrectExample: 'She studied hard and she passed the exam.',
    difficulty: 'beginner',
  },
  COMMA_SPLICE: {
    rule: 'Comma Splice',
    chapter: 'Chapter 27: Punctuation — The Comma',
    explanation: 'A comma splice joins two independent clauses with only a comma. Fix it with a period, semicolon, or a conjunction.',
    correctExample: 'She was tired; she went to bed. / She was tired, so she went to bed.',
    incorrectExample: 'She was tired, she went to bed.',
    difficulty: 'intermediate',
  },
  APOSTROPHE: {
    rule: 'The Apostrophe',
    chapter: 'Chapter 28: The Apostrophe',
    explanation: 'Apostrophes form possessives (John\'s book) and contractions (it\'s = it is). Never use an apostrophe for simple plural nouns.',
    correctExample: "John's car is parked outside. / It's raining today.",
    incorrectExample: "The car's are parked outside. / Its raining today.",
    difficulty: 'beginner',
  },
  ITS_IT_S: {
    rule: '"Its" vs. "It\'s"',
    chapter: 'Chapter 28: The Apostrophe',
    explanation: '"It\'s" = "it is" or "it has." "Its" = possessive pronoun. If you can substitute "it is," use "it\'s." Otherwise, use "its."',
    correctExample: "The dog wagged its tail. / It's a wonderful day.",
    incorrectExample: "The dog wagged it's tail. / Its a wonderful day.",
    difficulty: 'beginner',
  },
  SENTENCE_FRAGMENT: {
    rule: 'Sentence Fragment',
    chapter: 'Chapter 30: The Sentence',
    explanation: 'A complete sentence needs a subject, a verb, and a complete thought. A fragment lacks one or more of these elements.',
    correctExample: 'She ran quickly. She reached the station just in time.',
    incorrectExample: 'Running quickly. Reached the station in time.',
    difficulty: 'beginner',
  },
  DANGLING_MODIFIER: {
    rule: 'Dangling Modifier',
    chapter: 'Chapter 32: Modifiers',
    explanation: 'A dangling modifier does not logically connect to what it modifies. The subject performing the implied action must appear in the sentence.',
    correctExample: 'Having studied all night, she passed the exam.',
    incorrectExample: 'Having studied all night, the exam was passed.',
    difficulty: 'advanced',
  },
  PARALLEL_STRUCTURE: {
    rule: 'Parallel Structure',
    chapter: 'Chapter 33: Parallelism',
    explanation: 'Items in a series or paired elements connected by conjunctions must be grammatically parallel — the same part of speech or form.',
    correctExample: 'She likes reading, writing, and swimming.',
    incorrectExample: 'She likes reading, to write, and swim.',
    difficulty: 'intermediate',
  },
  AFFECT_EFFECT: {
    rule: '"Affect" vs. "Effect"',
    chapter: 'Chapter 12: Commonly Confused Words',
    explanation: '"Affect" is usually a verb (to influence). "Effect" is usually a noun (result). Mnemonic: RAVEN — Remember, Affect is a Verb, Effect is a Noun.',
    correctExample: 'The rain affected our plans. / The effect of the rain was significant.',
    incorrectExample: 'The rain effected our plans. / The affect was significant.',
    difficulty: 'beginner',
  },
  THERE_THEIR_THEYRE: {
    rule: '"There", "Their", "They\'re"',
    chapter: 'Chapter 12: Commonly Confused Words',
    explanation: '"There" = place or clause introducer. "Their" = possessive pronoun. "They\'re" = contraction of "they are."',
    correctExample: "There is the book. / Their book is here. / They're reading.",
    incorrectExample: "Their is the book. / There book is here.",
    difficulty: 'beginner',
  },
  YOUR_YOURE: {
    rule: '"Your" vs. "You\'re"',
    chapter: 'Chapter 12: Commonly Confused Words',
    explanation: '"Your" is a possessive pronoun. "You\'re" is a contraction of "you are."',
    correctExample: "Your book is on the table. / You're very kind.",
    incorrectExample: "You're book is on the table. / Your very kind.",
    difficulty: 'beginner',
  },
  THEN_THAN: {
    rule: '"Then" vs. "Than"',
    chapter: 'Chapter 12: Commonly Confused Words',
    explanation: '"Then" relates to time. "Than" is used in comparisons.',
    correctExample: 'She is taller than her brother. / First we eat, then we study.',
    incorrectExample: 'She is taller then her brother.',
    difficulty: 'beginner',
  },
  DOUBLE_NEGATION: {
    rule: 'Double Negative',
    chapter: 'Chapter 18: Double Negatives',
    explanation: 'Two negative words in a clause create a positive meaning in standard English. Use only one negative element to express a negative idea.',
    correctExample: 'I cannot find anything. / I can find nothing.',
    incorrectExample: 'I cannot find nothing.',
    difficulty: 'beginner',
  },
  REDUNDANCY: {
    rule: 'Redundancy',
    chapter: 'Chapter 22: Economy of Expression',
    explanation: 'Redundancy repeats the same idea in different words. Good writing should be concise and avoid tautology.',
    correctExample: 'Please return the book.',
    incorrectExample: 'Please return the book back.',
    difficulty: 'intermediate',
  },
  WORDINESS: {
    rule: 'Wordiness',
    chapter: 'Chapter 22: Economy of Expression',
    explanation: 'Wordy phrases use multiple words where one would suffice. Replace verbose constructions with concise alternatives.',
    correctExample: 'He is absent. / She helped us.',
    incorrectExample: 'He is not present at this point in time. / She gave us her assistance.',
    difficulty: 'intermediate',
  },
  CAPITALIZATION: {
    rule: 'Capitalization',
    chapter: 'Chapter 29: Capitalization',
    explanation: 'Capitalize the first word of a sentence, all proper nouns, and the pronoun "I." Do not capitalize common nouns unnecessarily.',
    correctExample: 'She studied at Oxford University. / I am a doctor.',
    incorrectExample: 'she studied at oxford university.',
    difficulty: 'beginner',
  },
  MORFOLOGIK_RULE_EN_US: {
    rule: 'Spelling Error',
    chapter: 'Chapter 35: Spelling',
    explanation: 'This word appears misspelled. Key English spelling rules: "i before e except after c," silent letters, and double consonants before -ing/-ed.',
    correctExample: 'necessary, receive, occurrence',
    incorrectExample: 'neccessary, recieve, occurence',
    difficulty: 'beginner',
  },
  MORFOLOGIK_RULE_EN_GB: {
    rule: 'Spelling Error (British English)',
    chapter: 'Chapter 35: Spelling',
    explanation: 'This word appears misspelled in British English. British and American spellings differ in some words.',
    correctExample: 'colour, centre, organise, travelled',
    incorrectExample: 'color, center, organize, traveled (in British contexts)',
    difficulty: 'beginner',
  },
  WHITESPACE_RULE: {
    rule: 'Spacing Error',
    chapter: 'Chapter 27: Punctuation',
    explanation: 'There should be a single space after punctuation marks. Double spaces are not standard in modern writing.',
    correctExample: 'She arrived, greeted everyone, and sat down.',
    incorrectExample: 'She arrived,  greeted everyone,  and sat down.',
    difficulty: 'beginner',
  },
  CORRELATIVE_CONJUNCTIONS: {
    rule: 'Correlative Conjunctions',
    chapter: 'Chapter 17: Conjunctions',
    explanation: 'Correlative conjunctions come in pairs: either/or, neither/nor, both/and, not only/but also. Both parts must connect grammatically parallel elements.',
    correctExample: 'She is not only talented but also hardworking.',
    incorrectExample: 'She is not only talented but also works hard.',
    difficulty: 'intermediate',
  },
  LIE_LAY: {
    rule: '"Lie" vs. "Lay"',
    chapter: 'Chapter 12: Commonly Confused Words',
    explanation: '"Lie" (recline) is intransitive. "Lay" (to place) is transitive and needs an object. The past tense of "lie" is "lay," which causes the most confusion.',
    correctExample: 'I lie down when tired. / Please lay the book on the table.',
    incorrectExample: 'I lay down when tired. (present tense)',
    difficulty: 'advanced',
  },
};

const CATEGORY_FALLBACKS: Record<string, WrenMartinExplanation> = {
  TYPOS: {
    rule: 'Spelling or Typographical Error',
    chapter: 'Chapter 35: Spelling',
    explanation: 'This appears to be a spelling or typographical error. Double-check the word against a dictionary.',
    correctExample: 'Verify the correct spelling in a reliable dictionary.',
    incorrectExample: '(depends on the specific word)',
    difficulty: 'beginner',
  },
  GRAMMAR: {
    rule: 'Grammatical Error',
    chapter: 'Chapter 24: Concord (Agreement)',
    explanation: 'There is a grammatical issue with this phrase or clause. Review the relevant rule on subject–verb agreement, tense, or sentence structure.',
    correctExample: 'Follow the grammatical rules appropriate to the context.',
    incorrectExample: '(depends on the specific error)',
    difficulty: 'intermediate',
  },
  PUNCTUATION: {
    rule: 'Punctuation Error',
    chapter: 'Chapter 27: Punctuation',
    explanation: 'Punctuation marks organize and clarify written text. Each mark has a specific purpose.',
    correctExample: 'She finished the report; her colleague reviewed it.',
    incorrectExample: 'She finished the report her colleague reviewed it.',
    difficulty: 'beginner',
  },
  STYLE: {
    rule: 'Style Suggestion',
    chapter: 'Chapter 22: Economy of Expression',
    explanation: 'This suggestion offers a more direct, engaging, or appropriate phrasing for formal writing.',
    correctExample: 'Use active voice, specific words, and varied sentence structure.',
    incorrectExample: '(context-dependent)',
    difficulty: 'intermediate',
  },
  REDUNDANCY: {
    rule: 'Redundant Expression',
    chapter: 'Chapter 22: Economy of Expression',
    explanation: 'This phrase contains a redundancy — information already expressed elsewhere. Removing it makes the sentence tighter.',
    correctExample: 'She gave a brief summary.',
    incorrectExample: 'She gave a brief summary overview.',
    difficulty: 'intermediate',
  },
  CONFUSED_WORDS: {
    rule: 'Commonly Confused Words',
    chapter: 'Chapter 12: Commonly Confused Words',
    explanation: 'Using the wrong word from a similar-sounding pair changes the meaning of your sentence.',
    correctExample: 'Consult a usage guide to distinguish between commonly confused pairs.',
    incorrectExample: '(depends on the specific word pair)',
    difficulty: 'beginner',
  },
  COLLOCATIONS: {
    rule: 'Collocation Error',
    chapter: 'Chapter 34: Idioms and Phrases',
    explanation: 'A collocation is a natural pairing of words. Unnatural pairings can make writing sound awkward.',
    correctExample: 'make a decision, do homework, heavy rain',
    incorrectExample: 'do a decision, make homework, strong rain',
    difficulty: 'advanced',
  },
  CASING: {
    rule: 'Incorrect Capitalization',
    chapter: 'Chapter 29: Capitalization',
    explanation: 'Words are incorrectly capitalized. Capitalize proper nouns, the pronoun "I," and the first word of every sentence.',
    correctExample: 'My name is John. I live in London.',
    incorrectExample: 'my name is john. i live in london.',
    difficulty: 'beginner',
  },
};

export function getWrenMartinExplanation(
  ruleId: string,
  categoryId: string
): WrenMartinExplanation {
  if (ruleId in RULE_DATABASE) {
    return RULE_DATABASE[ruleId]!;
  }

  for (const key of Object.keys(RULE_DATABASE)) {
    if (ruleId.startsWith(key) || key.startsWith(ruleId)) {
      return RULE_DATABASE[key]!;
    }
  }

  if (categoryId in CATEGORY_FALLBACKS) {
    return CATEGORY_FALLBACKS[categoryId]!;
  }

  return {
    rule: 'Grammar or Style Issue',
    chapter: 'Chapter 30: The Sentence',
    explanation: 'There is a potential grammar or style issue here. Review the highlighted text and consider rephrasing for greater clarity, correctness, or conciseness.',
    correctExample: 'Consult Wren & Martin\'s "High School English Grammar & Composition" for detailed guidance.',
    incorrectExample: '(depends on the specific error)',
    difficulty: 'intermediate' as DifficultyLevel,
  };
}

export function getAllRuleIds(): string[] {
  return Object.keys(RULE_DATABASE);
}
