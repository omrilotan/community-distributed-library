import { z } from "zod";

/**
 * What a library lends decides how its catalogue behaves, what its items
 * carry and the words it uses (decision 0031). Every difference between the
 * types is a trait here, so code asks "does this library merge by name?"
 * rather than "is it books?".
 *
 * Adding a type (games, say) is: an entry in LIBRARY_TYPES and TRAITS, a
 * migration widening the CHECK on communities.type (a table rebuild in
 * SQLite), its built-in tag namespace with library_type set, its details
 * schema, and its words. Nothing else should need to know the type's name.
 */
export const LIBRARY_TYPES = ["books", "things"] as const;

export const LibraryType = z.enum(LIBRARY_TYPES);
export type LibraryType = z.infer<typeof LibraryType>;

export interface LibraryTraits {
	/** Items may carry an ISBN, and an ISBN looks the item up. */
	isbn: boolean;
	/**
	 * Adding an item with a title already listed joins that entry: two copies
	 * of one novel are the same book. Off where two neighbours' "drill" are
	 * different drills.
	 */
	mergeByName: boolean;
	/** Duplicate entries are worth a moderator's look. */
	duplicates: boolean;
	/** Items have authors. */
	authors: boolean;
	/** An item may come as a set, lent in part ("6 of 12 chairs"). */
	sets: boolean;
	/**
	 * A borrower may hand an item straight on to the next one in line. Never
	 * for a set, whatever the type: passing "6 of 12 chairs" along is not worth
	 * its rules.
	 */
	relays: boolean;
	/** Members mark what they have read. */
	readMarks: boolean;
	/** The shape of an owner's details on their item, if any. */
	details: z.ZodType | null;
	/**
	 * Pictures of an item, and their shape: a book has one cover, tall like a
	 * book; a thing up to four square photos.
	 */
	photos: { most: number; aspect: number };
}

/**
 * A thing's details: about this drill, not drills. Each is optional and
 * short; "needs" is where consumables go ("bring your own gas").
 */
export const ThingDetails = z
	.object({
		brand: z.string().trim().min(1).max(80).optional(),
		model: z.string().trim().min(1).max(80).optional(),
		/** What comes with it: "carry bag, two batteries". */
		included: z.string().trim().min(1).max(300).optional(),
		/** What the borrower brings or buys: "gas canister, 2-stroke oil". */
		needs: z.string().trim().min(1).max(300).optional(),
		/** How to look after it: "dry before packing". */
		care: z.string().trim().min(1).max(300).optional(),
		/**
		 * The product's own page on another website (the maker's, a shop's),
		 * for its manual and specifications. Web addresses only; shown to
		 * members as a link to an outside site.
		 */
		link: z
			.url({ protocol: /^https?$/ })
			.max(500)
			.optional(),
	})
	.strict();

export type ThingDetails = z.infer<typeof ThingDetails>;

export const TRAITS: Record<LibraryType, LibraryTraits> = {
	books: {
		isbn: true,
		mergeByName: true,
		duplicates: true,
		authors: true,
		sets: false,
		relays: true,
		readMarks: true,
		details: null,
		photos: { most: 1, aspect: 5 / 8 },
	},
	things: {
		isbn: false,
		mergeByName: false,
		duplicates: false,
		authors: false,
		sets: true,
		relays: true,
		readMarks: false,
		details: ThingDetails,
		photos: { most: 4, aspect: 1 },
	},
};

export function traits(type: LibraryType): LibraryTraits {
	return TRAITS[type];
}
