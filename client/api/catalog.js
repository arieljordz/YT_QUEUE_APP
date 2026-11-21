// Vercel serverless function: read-only access to the shared video catalogs
// stored in MongoDB (filled by scripts/collect-karaoke.mjs).
//
//   GET /api/catalog            -> { catalogs: [{ name, count }] }
//   GET /api/catalog?name=karaoke -> { videos: [...] }
import { getCatalog } from "./_db.js";

const MAX_VIDEOS = 8000; // keeps the response under Vercel's 4.5 MB limit

/** Core logic, separated from the HTTP layer so it can be tested with any collection. */
export async function handleCatalog(catalog, query) {
  const name = typeof query?.name === "string" ? query.name : "";
  if (!name) {
    const rows = await catalog
      .aggregate([{ $group: { _id: "$catalog", count: { $sum: 1 } } }, { $sort: { _id: 1 } }])
      .toArray();
    return { status: 200, body: { catalogs: rows.map((r) => ({ name: r._id, count: r.count })) } };
  }
  const docs = await catalog.find({ catalog: name }).sort({ order: 1 }).limit(MAX_VIDEOS).toArray();
  return { status: 200, body: { videos: docs.map((d) => d.video) } };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const result = await handleCatalog(await getCatalog(), req.query);
    res.setHeader("Cache-Control", "public, s-maxage=60");
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("catalog read failed", error);
    return res.status(500).json({ error: "Could not read the catalog" });
  }
}
