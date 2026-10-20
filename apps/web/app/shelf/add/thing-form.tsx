import type { Locale, Strings } from "../../../lib/i18n.ts";
import type { Vocab } from "../../tags.tsx";
import { TagPicker } from "../../tags.tsx";
import { PhotosPicker } from "./photos-picker.tsx";

/**
 * Adding a thing to a library of things: what it is and how many, then the
 * owner's own details about this one (brand, what comes with it, what the
 * borrower brings). Each thing is its own entry; nothing is looked up.
 */
export function ThingForm({
	t,
	vocab,
	locale,
	count,
}: {
	t: Strings;
	vocab: Vocab;
	locale: Locale;
	count: number;
}) {
	const text = (
		name: string,
		label: string,
		placeholder: string,
		max: number,
	) => (
		<>
			<label htmlFor={name}>{label}</label>
			<input
				id={name}
				name={name}
				type="text"
				dir="auto"
				maxLength={max}
				placeholder={placeholder}
			/>
		</>
	);
	return (
		<form action="/api/copies" method="post" encType="multipart/form-data">
			<input type="hidden" name="kind" value="thing" />
			<input type="hidden" name="n" value={count} />
			<p className="form-key">{t.requiredKey}</p>
			<label htmlFor="name">{t.thingName}</label>
			<input
				id="name"
				name="name"
				type="text"
				dir="auto"
				maxLength={120}
				required
				placeholder={t.thingNamePlaceholder}
			/>

			<label htmlFor="quantity">{t.quantity}</label>
			<input
				id="quantity"
				name="quantity"
				type="number"
				min={1}
				max={500}
				defaultValue={1}
				dir="ltr"
				aria-describedby="quantity-hint"
			/>
			<p className="muted" id="quantity-hint">
				{t.quantityHint}
			</p>

			<p className="picker-label">{t.photos}</p>
			<PhotosPicker
				max={4}
				labels={{
					add: t.photosAdd,
					remove: t.photosRemove,
					zoom: t.coverZoom,
					hint: t.photosHint,
					main: t.photosMain,
					keep: t.photosKeep,
					earlier: t.photosEarlier,
					later: t.photosLater,
					room: {
						none: t.photosRoomNone,
						one: t.photosRoomOne,
						many: t.photosRoomMany,
					},
				}}
			/>

			<TagPicker vocab={vocab} locale={locale} legend={t.categoryLegend} />

			<fieldset className="thing-details">
				<legend className="muted">{t.thingDetails}</legend>
				<p className="callout callout-warn">{t.thingSafety}</p>
				{text("brand", t.brand, t.brandPlaceholder, 80)}
				{text("model", t.model, t.modelPlaceholder, 80)}
				{text("included", t.included, t.includedPlaceholder, 300)}
				{text("needs", t.needs, t.needsPlaceholder, 300)}
				{text("care", t.care, t.carePlaceholder, 300)}
				<label htmlFor="link">{t.productLink}</label>
				<input
					id="link"
					name="link"
					type="url"
					dir="ltr"
					maxLength={500}
					inputMode="url"
					placeholder={t.productLinkPlaceholder}
					aria-describedby="link-hint"
				/>
				<p className="muted" id="link-hint">
					{t.productLinkHint}
				</p>
			</fieldset>

			<label htmlFor="condition">{t.condition}</label>
			<select id="condition" name="condition" defaultValue="good">
				{(["new", "good", "worn", "fragile"] as const).map((value) => (
					<option key={value} value={value}>
						{t.conditionName(value)}
					</option>
				))}
			</select>

			<label htmlFor="note">{t.note}</label>
			<input
				id="note"
				name="note"
				type="text"
				dir="auto"
				maxLength={280}
				placeholder={t.thingNotePlaceholder}
			/>

			<button type="submit" className="wide-on-phone">
				{t.save}
			</button>
		</form>
	);
}
