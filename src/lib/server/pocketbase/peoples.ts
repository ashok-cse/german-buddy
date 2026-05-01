import type PocketBase from 'pocketbase';
import type { ListResult } from 'pocketbase';

export const PEOPLES_COLLECTION = 'peoples';

export type PeoplesRecord = {
	id: string;
	name?: string;
	email: string;
	trial_starts?: string;
	trial_ends?: string;
	free_trial_used?: boolean;
	created?: string;
	updated?: string;
};

type CreatePeoplesInput = {
	email: string;
	name?: string;
	trial_starts: string;
	trial_ends: string;
	free_trial_used: boolean;
};

type UpdatePeoplesInput = Partial<
	Pick<CreatePeoplesInput, 'name' | 'trial_starts' | 'trial_ends' | 'free_trial_used'>
>;

function addDays(d: Date, n: number): Date {
	const x = new Date(d);
	x.setUTCDate(x.getUTCDate() + n);
	return x;
}

/** PocketBase `date` fields expect `YYYY-MM-DD`. */
function toPbDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

/**
 * Today vs `trial_ends` (`YYYY-MM-DD`): still on or before last trial day → active.
 * After that calendar day, trial is over.
 */
export function isTrialActive(record: PeoplesRecord): boolean {
	if (!record.trial_ends) return false;
	const today = toPbDate(new Date());
	return today <= record.trial_ends;
}

/**
 * On Google OAuth: ensure one `peoples` row per email.
 * New rows get a 7-day trial window. Existing rows: sync name; once calendar date is past
 * `trial_ends`, set `free_trial_used` to true (trial consumed).
 */
export async function ensurePeoplesForOAuthUser(
	pb: PocketBase,
	params: { email: string; name?: string | null }
): Promise<PeoplesRecord> {
	const email = normalizeEmail(params.email);
	const filter = pb.filter('email = {:email}', { email });

	try {
		const existing = await pb.collection(PEOPLES_COLLECTION).getFirstListItem<PeoplesRecord>(filter);

		const today = toPbDate(new Date());
		const trialExpired = !!existing.trial_ends && today > existing.trial_ends;
		const shouldMarkTrialUsed = trialExpired && existing.free_trial_used !== true;

		const nameChanged =
			params.name != null && params.name !== '' && existing.name !== params.name;

		if (shouldMarkTrialUsed || nameChanged) {
			const patch: UpdatePeoplesInput = {};
			if (nameChanged) patch.name = params.name ?? '';
			if (shouldMarkTrialUsed) patch.free_trial_used = true;
			return await pb.collection(PEOPLES_COLLECTION).update<PeoplesRecord>(existing.id, patch);
		}
		return existing;
	} catch (e: unknown) {
		const status =
			e && typeof e === 'object' && 'status' in e ? (e as { status: number }).status : 0;
		if (status !== 404) throw e;
	}

	const now = new Date();
	const trialEnds = addDays(now, 7);
	const payload: CreatePeoplesInput = {
		email,
		name: params.name ?? '',
		trial_starts: toPbDate(now),
		trial_ends: toPbDate(trialEnds),
		free_trial_used: false
	};
	return await pb.collection(PEOPLES_COLLECTION).create<PeoplesRecord>(payload);
}

export async function listPeoples(
	pb: PocketBase,
	page = 1,
	perPage = 50,
	options?: { filter?: string; sort?: string }
): Promise<ListResult<PeoplesRecord>> {
	return pb.collection(PEOPLES_COLLECTION).getList<PeoplesRecord>(page, perPage, {
		filter: options?.filter,
		sort: options?.sort
	});
}

export async function getPeoplesById(pb: PocketBase, id: string): Promise<PeoplesRecord> {
	return pb.collection(PEOPLES_COLLECTION).getOne<PeoplesRecord>(id);
}

export async function getPeoplesByEmail(pb: PocketBase, email: string): Promise<PeoplesRecord | null> {
	const filter = pb.filter('email = {:email}', { email: normalizeEmail(email) });
	try {
		return await pb.collection(PEOPLES_COLLECTION).getFirstListItem<PeoplesRecord>(filter);
	} catch (e: unknown) {
		const status =
			e && typeof e === 'object' && 'status' in e ? (e as { status: number }).status : 0;
		if (status === 404) return null;
		throw e;
	}
}

export async function createPeoples(
	pb: PocketBase,
	body: Omit<CreatePeoplesInput, 'email'> & { email: string }
): Promise<PeoplesRecord> {
	const payload: CreatePeoplesInput = {
		email: normalizeEmail(body.email),
		name: body.name,
		trial_starts: body.trial_starts,
		trial_ends: body.trial_ends,
		free_trial_used: body.free_trial_used
	};
	return pb.collection(PEOPLES_COLLECTION).create<PeoplesRecord>(payload);
}

export async function updatePeoples(
	pb: PocketBase,
	id: string,
	body: UpdatePeoplesInput
): Promise<PeoplesRecord> {
	return pb.collection(PEOPLES_COLLECTION).update<PeoplesRecord>(id, body);
}

export async function deletePeoples(pb: PocketBase, id: string): Promise<boolean> {
	return pb.collection(PEOPLES_COLLECTION).delete(id);
}

/** Full list with pagination handled by the SDK (admin only). */
export async function getAllPeoples(
	pb: PocketBase,
	batch = 200,
	options?: { filter?: string; sort?: string }
): Promise<PeoplesRecord[]> {
	return pb.collection(PEOPLES_COLLECTION).getFullList<PeoplesRecord>(batch, {
		filter: options?.filter,
		sort: options?.sort
	});
}
