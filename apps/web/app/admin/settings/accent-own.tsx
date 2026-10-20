"use client";

/**
 * The colour field of "your own colour". Changing it picks that option, so
 * nobody chooses a colour and saves a swatch they had ticked before; without
 * a script the option is ticked by hand, beside it.
 */
export function AccentOwn({
	defaultValue,
	radio,
	label,
}: {
	defaultValue: string;
	/** The id of the radio this colour belongs to. */
	radio: string;
	label: string;
}) {
	const choose = () => {
		const option = document.getElementById(radio);
		if (option instanceof HTMLInputElement) option.checked = true;
	};
	return (
		<input
			type="color"
			name="accentOwn"
			defaultValue={defaultValue}
			aria-label={label}
			onInput={choose}
			onChange={choose}
		/>
	);
}
