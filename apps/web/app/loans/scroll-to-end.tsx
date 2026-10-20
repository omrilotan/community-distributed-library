"use client";

import { useEffect, useRef } from "react";

/** Lands the reader at the latest message, like any chat. */
export function ScrollToEnd() {
	const anchor = useRef<HTMLDivElement>(null);
	useEffect(() => {
		anchor.current?.scrollIntoView({ block: "end" });
	}, []);
	return <div ref={anchor} />;
}
