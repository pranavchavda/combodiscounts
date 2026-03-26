/**
 * Public endpoint — no auth required.
 * Returns the Sweetbird sample picker config from a local JSON file
 * written by the admin save action.
 *
 * GET /api/sweetbird/config
 */

import { json } from "@remix-run/node";
import { readFile } from "fs/promises";
import { join } from "path";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const DEFAULT_CONFIG = {
  active: false,
  offerTitle: "Choose your free Sweetbird syrup sample!",
  qualifyingCollectionIds: [],
  qualifyingCollectionTitles: [],
  syrups: [],
};

const CONFIG_PATH = join(process.cwd(), "sweetbird-config.json");

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    return json(config, { headers: CORS_HEADERS });
  } catch {
    return json(DEFAULT_CONFIG, { headers: CORS_HEADERS });
  }
};

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });
};
