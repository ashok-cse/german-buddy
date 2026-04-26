export type DiffOp = { kind: 'equal' | 'del' | 'ins'; text: string };

/**
 * Character-level diff using LCS. Splits with Array.from so multi-byte glyphs
 * (e.g. ö, ß) are treated as single units.
 */
export function diffChars(a: string, b: string): DiffOp[] {
	const A = Array.from(a);
	const B = Array.from(b);
	const n = A.length;
	const m = B.length;

	const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			dp[i][j] = A[i - 1] === B[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
		}
	}

	const ops: DiffOp[] = [];
	let i = n;
	let j = m;
	while (i > 0 && j > 0) {
		if (A[i - 1] === B[j - 1]) {
			ops.push({ kind: 'equal', text: A[i - 1] });
			i--;
			j--;
		} else if (dp[i - 1][j] >= dp[i][j - 1]) {
			ops.push({ kind: 'del', text: A[i - 1] });
			i--;
		} else {
			ops.push({ kind: 'ins', text: B[j - 1] });
			j--;
		}
	}
	while (i > 0) {
		ops.push({ kind: 'del', text: A[i - 1] });
		i--;
	}
	while (j > 0) {
		ops.push({ kind: 'ins', text: B[j - 1] });
		j--;
	}
	ops.reverse();

	const merged: DiffOp[] = [];
	for (const op of ops) {
		const prev = merged[merged.length - 1];
		if (prev && prev.kind === op.kind) prev.text += op.text;
		else merged.push({ kind: op.kind, text: op.text });
	}
	return merged;
}
