/**
 * lib/indexers/personal.ts - Personal data indexer
 *
 * Reads JSON files from the personal data directory and indexes
 * 8 types: book, person, movie, podcast, interest, habit, profile, preference.
 *
 * Source: personal
 * Topic: (empty - type handles categorization)
 * Type: derived from JSON filename
 * Timestamp: file mtime, or date_read/date_watched when available
 */

import { readFileSync, statSync, existsSync } from "fs";
import { join } from "path";
import { checkPath, type IndexerContext } from "../indexer";

function fileMtime(path: string): string {
  return statSync(path).mtime.toISOString();
}

function toISO(dateStr: string, fallback: string): string {
  if (!dateStr) return fallback;
  const s = String(dateStr);
  return s.includes("T") ? s : `${s.slice(0, 10)}T00:00:00Z`;
}

export async function indexPersonal(ctx: IndexerContext): Promise<void> {
  const personalDir = ctx.config.paths.personal;

  if (!checkPath("personal", "paths.personal", personalDir)) return;

  // Books
  const booksPath = join(personalDir, "books.json");
  if (existsSync(booksPath)) {
    try {
      const booksTs = fileMtime(booksPath);
      const books = JSON.parse(readFileSync(booksPath, "utf-8"));
      for (const book of books) {
        if (!book.title) continue;
        const content = `${book.title} by ${book.author || "unknown"}\n${book.notes || ""}`;
        const timestamp = book.date_read
          ? toISO(book.date_read, booksTs)
          : booksTs;

        ctx.insert({
          source: "personal",
          title: `[book] ${book.title}`,
          content,
          topic: "",
          type: "book",
          timestamp,
          metadata: { name: book.title },
        });
      }
    } catch (e) {
      console.warn(`Failed to read books.json: ${e}`);
    }
  }

  // People
  const peoplePath = join(personalDir, "people.json");
  if (existsSync(peoplePath)) {
    try {
      const peopleTs = fileMtime(peoplePath);
      const people = JSON.parse(readFileSync(peoplePath, "utf-8"));
      for (const person of people) {
        if (!person.name) continue;
        const content = `${person.name}\n${person.relationship || ""}\n${person.notes || ""}`;

        ctx.insert({
          source: "personal",
          title: `[person] ${person.name}`,
          content,
          topic: "",
          type: "person",
          timestamp: peopleTs,
          metadata: { name: person.name },
        });
      }
    } catch (e) {
      console.warn(`Failed to read people.json: ${e}`);
    }
  }

  // Movies
  const moviesPath = join(personalDir, "movies.json");
  if (existsSync(moviesPath)) {
    try {
      const moviesTs = fileMtime(moviesPath);
      const movies = JSON.parse(readFileSync(moviesPath, "utf-8"));
      for (const movie of movies) {
        if (!movie.title) continue;
        const year = movie.year || "";
        const content = year
          ? `${movie.title} (${year})\n${movie.notes || ""}`
          : `${movie.title}\n${movie.notes || ""}`;
        const timestamp = movie.date_watched
          ? toISO(movie.date_watched, moviesTs)
          : moviesTs;

        ctx.insert({
          source: "personal",
          title: `[movie] ${movie.title}`,
          content,
          topic: "",
          type: "movie",
          timestamp,
          metadata: { name: movie.title },
        });
      }
    } catch (e) {
      console.warn(`Failed to read movies.json: ${e}`);
    }
  }

  // Podcasts (field is "title", not "name")
  const podcastsPath = join(personalDir, "podcasts.json");
  if (existsSync(podcastsPath)) {
    try {
      const podcastsTs = fileMtime(podcastsPath);
      const podcasts = JSON.parse(readFileSync(podcastsPath, "utf-8"));
      for (const podcast of podcasts) {
        const name = podcast.title || "";
        if (!name) continue;
        const content = `${name}\n${podcast.description || ""}`;

        ctx.insert({
          source: "personal",
          title: `[podcast] ${name}`,
          content,
          topic: "",
          type: "podcast",
          timestamp: podcastsTs,
          metadata: { name },
        });
      }
    } catch (e) {
      console.warn(`Failed to read podcasts.json: ${e}`);
    }
  }

  // Interests (array of strings, not objects)
  const interestsPath = join(personalDir, "interests.json");
  if (existsSync(interestsPath)) {
    try {
      const interestsTs = fileMtime(interestsPath);
      const interests = JSON.parse(readFileSync(interestsPath, "utf-8"));
      for (const interest of interests) {
        if (typeof interest !== "string" || !interest) continue;

        ctx.insert({
          source: "personal",
          title: `[interest] ${interest}`,
          content: interest,
          topic: "",
          type: "interest",
          timestamp: interestsTs,
          metadata: { name: interest },
        });
      }
    } catch (e) {
      console.warn(`Failed to read interests.json: ${e}`);
    }
  }

  // Habits (field is "habit" not "name", "frequency" not "description")
  const habitsPath = join(personalDir, "habits.json");
  if (existsSync(habitsPath)) {
    try {
      const habitsTs = fileMtime(habitsPath);
      const habits = JSON.parse(readFileSync(habitsPath, "utf-8"));
      for (const habit of habits) {
        const habitName = habit.habit || "";
        if (!habitName) continue;
        const frequency = habit.frequency || "";
        const content = frequency ? `${habitName} (${frequency})` : habitName;

        ctx.insert({
          source: "personal",
          title: `[habit] ${habitName}`,
          content,
          topic: "",
          type: "habit",
          timestamp: habitsTs,
          metadata: { name: habitName },
        });
      }
    } catch (e) {
      console.warn(`Failed to read habits.json: ${e}`);
    }
  }

  // Profile (one entry per field)
  const profilePath = join(personalDir, "profile.json");
  if (existsSync(profilePath)) {
    try {
      const profileTs = fileMtime(profilePath);
      const profile = JSON.parse(readFileSync(profilePath, "utf-8"));
      for (const [key, value] of Object.entries(profile)) {
        if (value === null || value === undefined) continue;
        const content = `${key}: ${String(value)}`;

        ctx.insert({
          source: "personal",
          title: `[profile] ${key}`,
          content,
          topic: "",
          type: "profile",
          timestamp: profileTs,
          metadata: { name: key },
        });
      }
    } catch (e) {
      console.warn(`Failed to read profile.json: ${e}`);
    }
  }

  // Preferences (one entry per category/key)
  const preferencesPath = join(personalDir, "preferences.json");
  if (existsSync(preferencesPath)) {
    try {
      const prefsTs = fileMtime(preferencesPath);
      const preferences = JSON.parse(readFileSync(preferencesPath, "utf-8"));
      for (const [category, settings] of Object.entries(preferences)) {
        if (typeof settings === "object" && settings !== null) {
          for (const [key, value] of Object.entries(
            settings as Record<string, unknown>,
          )) {
            const content = `${category}/${key}: ${String(value)}`;

            ctx.insert({
              source: "personal",
              title: `[preference] ${category}/${key}`,
              content,
              topic: "",
              type: "preference",
              timestamp: prefsTs,
              metadata: { name: `${category}/${key}` },
            });
          }
        } else {
          const content = `${category}: ${String(settings)}`;

          ctx.insert({
            source: "personal",
            title: `[preference] ${category}`,
            content,
            topic: "",
            type: "preference",
            timestamp: prefsTs,
            metadata: { name: category },
          });
        }
      }
    } catch (e) {
      console.warn(`Failed to read preferences.json: ${e}`);
    }
  }
}
