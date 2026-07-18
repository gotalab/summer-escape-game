import { expect, type Page } from "@playwright/test";

async function displayedCount(page: Page): Promise<number> {
	const text = await page.getByTestId("candidate-count").innerText();
	const match = text.match(/\d+/);
	if (!match) throw new Error(`Candidate count is not numeric: ${text}`);
	return Number(match[0]);
}

export async function completeDuel(page: Page): Promise<number[]> {
	const counts: number[] = [];
	const expectedCounts = [32, 16, 8, 3];
	await page.getByTestId("search-button").click();
	await expect(page.getByTestId("duel-question")).toBeVisible();
	await expect(page.getByTestId("candidate-count")).toContainText(String(expectedCounts[0]));
	counts.push(await displayedCount(page));

	for (let step = 1; step <= 3; step += 1) {
		await expect(page.getByTestId("duel-step")).toContainText(`${step}`);
		const choices = page.getByTestId("duel-choice");
		await expect(choices).toHaveCount(2);
		await choices.first().click();
		await expect(page.getByTestId("candidate-count")).toContainText(String(expectedCounts[step]));
		counts.push(await displayedCount(page));
	}

	return counts;
}
