import { expect, test } from "@playwright/test";

test("the about page names the project's home, says the software is open and links to it", async ({
	page,
}) => {
	await page.goto("/about?lang=en");
	const open = page.locator(".about-open");
	await expect(open.getByRole("heading")).toHaveText(
		"Open source, and everyone's",
	);
	await expect(
		open.getByRole("link", { name: "community-distributed-library.com" }),
	).toHaveAttribute("href", "https://community-distributed-library.com");
	await expect(
		open.getByRole("link", { name: "The code on GitHub" }),
	).toHaveAttribute(
		"href",
		"https://github.com/omrilotan/community-distributed-library",
	);
});
