const https = require("https");
const querystring = require("querystring");

const params = querystring.stringify({
  grant_type: "client_credentials",
  client_id: process.env.CLIENT_ID || "<your-client-id>",
  client_secret:
    process.env.CLIENT_SECRET || "<your-client-secret>",
  scope:
    process.env.SCOPE ||
    "<your-scope>/.default",
});

const tenantId = process.env.TENANT_ID || "<your-tenant-id>";

const options = {
  hostname: "login.microsoftonline.com",
  path: `/${tenantId}/oauth2/v2.0/token`,
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "Content-Length": Buffer.byteLength(params),
  },
};

const req = https.request(options, (res) => {
  let data = "";
  res.on("data", (chunk) => (data += chunk));
  res.on("end", () => {
    const json = JSON.parse(data);
    if (json.access_token) {
      console.log(JSON.stringify({ token: json.access_token }));
    } else {
      process.stderr.write("Token error: " + data + "\n");
      process.exit(1);
    }
  });
});

req.on("error", (e) => {
  process.stderr.write("Request error: " + e.message + "\n");
  process.exit(1);
});

req.write(params);
req.end();
