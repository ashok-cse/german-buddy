/** Shape returned by `/api/correct` and produced by the LLM. */
export type CorrectionResult = {
	original: string;
	corrected: string;
	natural: string;
	english: string;
	tip: string;
};
