import express from "express";
import fetch from "node-fetch";
import pg from "pg";

const app = express();
app.use(express.json());

// ================= CONFIG =================
const CF_API_TOKEN = "bZEd1nz3QThFeDtDtpmirsgET_WGmSlmxDk9pwqg";
const CF_ACCOUNT_ID = "2013991c6b28d4d548391ef49258dfbf";
const CF_ZONE_ID = "e5cfbc422c65ab7f43c4b6520d70c2ec";
const BACKEND_SECRET = "snowissofat.com";

// ================= DATABASE =================
const db = new pg.Pool({ connectionString: "postgres://user:password@localhost:5432/db" });

(async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS subdomains (
      id SERIAL PRIMARY KEY,
      subdomain TEXT NOT NULL UNIQUE,
      domain TEXT NOT NULL,
      owner_discord_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
})();

// ================= AUTH =================
function auth(req, res, next) {
  if (req.headers.authorization !== BACKEND_SECRET) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
  next();
}

// ================= HELPERS =================
async function subdomainExists(name) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?name=${name}.qetoo.online`,
    { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } }
  );
  const data = await res.json();
  return data.result.length > 0;
}

// ================= ENDPOINTS =================
app.post("/subdomain/create", auth, async (req, res) => {
  const { subdomain, userId } = req.body;

  if (!/^[a-z0-9-]{1,20}$/.test(subdomain)) return res.json({ error: "INVALID_NAME" });

  try {
    await db.query(
      "INSERT INTO subdomains (subdomain, domain, owner_discord_id) VALUES ($1,$2,$3)",
      [subdomain, "qetoo.online", userId]
    );
  } catch {
    return res.json({ error: "SUBDOMAIN_TAKEN" });
  }

  if (await subdomainExists(subdomain)) {
    await db.query("DELETE FROM subdomains WHERE subdomain=$1", [subdomain]);
    return res.json({ error: "SUBDOMAIN_TAKEN" });
  }

  // Create Pages project
  await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: subdomain, production_branch: "main" })
  });

  res.json({ success: true, fqdn: `${subdomain}.qetoo.online` });
});

app.post("/files/create", auth, async (req, res) => {
  const { subdomain, filename, content } = req.body;

  // Placeholder: in production, this should deploy to Cloudflare Pages
  console.log(`File update requested: ${subdomain}/${filename}`);
  console.log("Content:", content);

  res.json({ success: true });
});

app.listen(3000, () => console.log("Backend running on port 3000"));
