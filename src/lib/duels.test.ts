import { describe, expect, it } from "vitest";
import { applyDuelAnswers, diversityRerank, nextDuelQuestion, rankDuelCandidates, validateDuelAnswers, type DuelCandidate } from "./duels";

const candidates: DuelCandidate[] = [
  { id: "lake-a", categories: ["water"], walking: "low", distanceKm: 80, apparentTemperature: 24, precipitationProbability: 10, windSpeed: 4, score: 90, prefecture: "A" },
  { id: "coast-b", categories: ["coast"], walking: "medium", distanceKm: 120, apparentTemperature: 25, precipitationProbability: 20, windSpeed: 12, score: 88, prefecture: "B" },
  { id: "river-c", categories: ["water", "forest"], walking: "high", distanceKm: 180, apparentTemperature: 23, precipitationProbability: 30, windSpeed: 8, score: 85, prefecture: "C" },
  { id: "forest-d", categories: ["forest"], walking: "low", distanceKm: 220, apparentTemperature: 22, precipitationProbability: 15, windSpeed: 3, score: 84, prefecture: "D" },
  { id: "hill-e", categories: ["highland"], walking: "medium", distanceKm: 280, apparentTemperature: 21, precipitationProbability: 25, windSpeed: 10, score: 82, prefecture: "E" },
  { id: "forest-f", categories: ["forest"], walking: "high", distanceKm: 340, apparentTemperature: 20, precipitationProbability: 40, windSpeed: 7, score: 80, prefecture: "F" },
];

describe("duel exploration", () => {
  it("creates a meaningful binary split and reports exact counts", () => {
    const question = nextDuelQuestion(candidates, []);
    expect(question).not.toBeNull();
    expect(question!.choices).toHaveLength(2);
    expect(question!.choices.reduce((sum, choice) => sum + choice.remainingCount, 0)).toBe(candidates.length);
    expect(Math.min(...question!.choices.map((choice) => choice.remainingCount))).toBeGreaterThanOrEqual(2);
  });

  it("replays an encoded answer deterministically", () => {
    const question = nextDuelQuestion(candidates, [])!;
    const answer = { questionId: question.id, choiceId: question.choices[0].id };
    expect(applyDuelAnswers(candidates, [answer]).map((item) => item.id)).toEqual(applyDuelAnswers(candidates, [answer]).map((item) => item.id));
    expect(applyDuelAnswers(candidates, [answer])).toHaveLength(question.choices[0].remainingCount);
    expect(validateDuelAnswers(candidates, [answer])).toBe(true);
    expect(validateDuelAnswers(candidates, [{ questionId: "distance:999", choiceId: "near" }])).toBe(false);
  });

  it("uses the selected half as the population for the next question", () => {
    const deck = [...candidates, ...candidates.map((candidate, index) => ({
      ...candidate,
      id: `${candidate.id}-second`,
      distanceKm: candidate.distanceKm + 15 + index,
      score: candidate.score - 1,
    }))];
    const firstQuestion = nextDuelQuestion(deck, [], "hard-filter")!;
    const firstAnswer = { questionId: firstQuestion.id, choiceId: firstQuestion.choices[0].id };
    const remaining = applyDuelAnswers(deck, [firstAnswer]);
    const secondQuestion = nextDuelQuestion(remaining, [firstAnswer], "hard-filter")!;

    expect(remaining).toHaveLength(firstQuestion.choices[0].remainingCount);
    expect(secondQuestion.choices.reduce((sum, choice) => sum + choice.remainingCount, 0)).toBe(remaining.length);
    expect(validateDuelAnswers(deck, [firstAnswer, { questionId: secondQuestion.id, choiceId: secondQuestion.choices[0].id }])).toBe(true);
  });

  it("returns at most three diverse, unique candidates", () => {
    const selected = diversityRerank(candidates, 3);
    expect(selected).toHaveLength(3);
    expect(new Set(selected.map((item) => item.id)).size).toBe(3);
    expect(selected[0].id).toBe("lake-a");
  });

  it("uses answers as ranking signals without discarding candidates", () => {
    const question = nextDuelQuestion(candidates, [])!;
    const answer = { questionId: question.id, choiceId: question.choices[0].id };
    const ranked = rankDuelCandidates(candidates, [answer]);
    expect(ranked).toHaveLength(candidates.length);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked.at(-1)!.score);
    expect(validateDuelAnswers(candidates, [answer])).toBe(true);
  });

  it("accepts an encoded answer after weather values refresh", () => {
    const question = nextDuelQuestion(candidates, [])!;
    const answer = { questionId: question.id, choiceId: question.choices[0].id };
    const refreshed = candidates.map((candidate) => ({ ...candidate, apparentTemperature: candidate.apparentTemperature + 0.7, windSpeed: candidate.windSpeed + 1 }));
    expect(validateDuelAnswers(refreshed, [answer])).toBe(true);
  });

  it("offers three deterministic questions when enough axes are viable", () => {
    const answers = [] as Array<{ questionId: string; choiceId: string }>;
    for (let step = 0; step < 3; step += 1) {
      const question = nextDuelQuestion(candidates, answers);
      expect(question).not.toBeNull();
      answers.push({ questionId: question!.id, choiceId: question!.choices[0].id });
    }
    expect(new Set(answers.map((answer) => answer.questionId.split(":")[0])).size).toBe(3);
    expect(answers.every((answer) => /:v[0-5]$/.test(answer.questionId))).toBe(true);
    expect(nextDuelQuestion(candidates, answers)).toBeNull();
  });

  it("varies both the question axis and wording across repeat plays", () => {
    const questions = Array.from({ length: 24 }, (_, index) => nextDuelQuestion(candidates, [], `play-${index}`)!);
    expect(new Set(questions.map((question) => question.id.split(":")[0])).size).toBeGreaterThanOrEqual(4);
    expect(new Set(questions.map((question) => question.prompt)).size).toBeGreaterThanOrEqual(8);
  });

  it("does not ask temperature, rain or wind questions for terrain-only estimates", () => {
    const terrainQuestions = Array.from({ length: 24 }, (_, index) =>
      nextDuelQuestion(candidates, [], `terrain-${index}`, { includeForecastAxes: false })!);
    const axes = new Set(terrainQuestions.map((question) => question.id.split(":")[0]));

    expect(axes.has("temperature")).toBe(false);
    expect(axes.has("rain")).toBe(false);
    expect(axes.has("breeze")).toBe(false);
    expect([...axes].every((axis) => ["landscape", "distance", "shelter", "walking"].includes(axis))).toBe(true);
  });

  it("opposite answers change which candidate rises to the top", () => {
    const question = nextDuelQuestion(candidates, [], "opposite-answer")!;
    const left = rankDuelCandidates(candidates, [{ questionId: question.id, choiceId: question.choices[0].id }]);
    const right = rankDuelCandidates(candidates, [{ questionId: question.id, choiceId: question.choices[1].id }]);
    expect(left[0].id).not.toBe(right[0].id);
    expect(applyDuelAnswers(candidates, [{ questionId: question.id, choiceId: question.choices[0].id }]).map((item) => item.id)).toContain(left[0].id);
    expect(applyDuelAnswers(candidates, [{ questionId: question.id, choiceId: question.choices[1].id }]).map((item) => item.id)).toContain(right[0].id);
  });
});
