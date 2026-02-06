import express from "express";
import fetch from "node-fetch";
import sqlite3 from "sqlite3";

const app = express();
app.use(express.json());

// ================= CONFIG =================
const CF_API_TOKEN = "bZEd1nz3QThFeDtDtpmirsgET_WGmSlmxDk9pwqg"; // your Cloudflare token here
const CF_ACCOUNT_ID = "2013991c6b28d4d548391ef49258dfbf";
const CF_ZONE_ID = "e5cfbc422c65ab7f43c4b6520d70c2ec";
const BACKEND_SECRET = "snowissofat.com"; // your secret string

// ================= DATABASE =================
const db = new sqlite3.Database("./subdomains.db");
db.run(`
  CREATE TABLE IF NOT EXISTS subdomains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subdomain TEXT UNIQUE,
    domain TEXT,
    owner_discord_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

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

async function createPagesDeployment(subdomain, filename, content) {
  const projectName = subdomain;

  // Create a Pages deployment with a single file
  const deployResponse = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}/deployments`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        files: { [filename]: content }
      })
    }
  );

  return deployResponse.json();
}

// ================= ENDPOINTS =================
app.post("/subdomain/create", auth, async (req, res) => {
  const { subdomain, userId } = req.body;

  if (!/^[a-z0-9-]{1,20}$/.test(subdomain))
    return res.json({ error: "INVALID_NAME" });

  if (await subdomainExists(subdomain)) {
    return res.json({ error: "SUBDOMAIN_TAKEN" });
  }

  db.run(
    "INSERT INTO subdomains (subdomain, domain, owner_discord_id) VALUES (?, ?, ?)",
    [subdomain, "qetoo.online", userId],
    async function(err) {
      if (err) return res.json({ error: "SUBDOMAIN_TAKEN" });

      // Create Cloudflare Pages project
      const projectResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CF_API_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ name: subdomain, production_branch: "main" })
        }
      );
      const projectData = await projectResponse.json();

      if (!projectData.success) {
        return res.json({ error: "FAILED_TO_CREATE_PROJECT" });
      }

      res.json({ success: true, fqdn: `${subdomain}.qetoo.online` });
    }
  );
});

app.post("/files/create", auth, async (req, res) => {
  const { subdomain, filename, content } = req.body;

  if (!subdomain || !filename || content === undefined)
    return res.status(400).json({ error: "MISSING_PARAMS" });

  try {
    const deployResult = await createPagesDeployment(subdomain, filename, content);
    if (deployResult.success) {
      console.log(`File updated: ${subdomain}/${filename}`);
      return res.json({ success: true });
    } else {
      console.error(deployResult);
      return res.json({ error: "DEPLOY_FAILED" });
    }
  } catch (err) {
    console.error(err);
    return res.json({ error: "SERVER_ERROR" });
  }
});

app.listen(3000, () => console.log("Backend running on port 3000"));
