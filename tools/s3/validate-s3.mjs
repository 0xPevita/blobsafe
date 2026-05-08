import { createHash, createHmac } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const endpoint = process.env.SHELBY_S3_GATEWAY_URL || "http://localhost:9000";
const bucket = process.env.SHELBY_S3_BUCKET;
const prefix = Object.prototype.hasOwnProperty.call(process.env, "BLOBSAFE_S3_PREFIX")
  ? process.env.BLOBSAFE_S3_PREFIX
  : "blobsafe/";
const objectKey = process.env.BLOBSAFE_S3_OBJECT_KEY || "";
const putTest = /^(1|true|yes)$/i.test(process.env.BLOBSAFE_S3_PUT_TEST || "");
const region = process.env.SHELBY_S3_REGION || "shelbyland";
const accessKeyId = process.env.SHELBY_S3_ACCESS_KEY_ID || "AKIAIOSFODNN7EXAMPLE";
const secretAccessKey = process.env.SHELBY_S3_SECRET_ACCESS_KEY || "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const service = "s3";

if (!bucket) {
  throw new Error("Set SHELBY_S3_BUCKET to your Shelby account address, for example: $env:SHELBY_S3_BUCKET='0x...'");
}

const hashHex = (value) => createHash("sha256").update(value).digest("hex");
const hmac = (key, value, encoding) => createHmac("sha256", key).update(value).digest(encoding);

const amzDate = () => {
  const value = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    dateTime: value,
    date: value.slice(0, 8),
  };
};

const encodePath = (value) =>
  value
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

const canonicalQuery = (params) =>
  [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

const signingKey = (date) => {
  const kDate = hmac(`AWS4${secretAccessKey}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
};

async function signedRequest({ method, path, query = new URLSearchParams(), body, headers = {}, output = "text" }) {
  const base = new URL(endpoint);
  const requestUrl = new URL(base.toString());
  requestUrl.pathname = path;
  requestUrl.search = query.toString();

  const payload = body === undefined
    ? undefined
    : body instanceof Uint8Array
      ? body
      : Buffer.from(String(body));
  const payloadHash = hashHex(payload ?? "");
  const { dateTime, date } = amzDate();
  const host = requestUrl.host;
  const signingHeaders = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": dateTime,
    ...Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value).trim()])
    ),
  };
  const sortedHeaderEntries = Object.entries(signingHeaders)
    .sort(([a], [b]) => a.localeCompare(b));
  const canonicalHeaders = sortedHeaderEntries
    .map(([key, value]) => `${key}:${value}\n`)
    .join("");
  const signedHeaders = sortedHeaderEntries.map(([key]) => key).join(";");
  const canonicalRequest = [
    method,
    requestUrl.pathname,
    canonicalQuery(query),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    dateTime,
    credentialScope,
    hashHex(canonicalRequest),
  ].join("\n");
  const signature = hmac(signingKey(date), stringToSign, "hex");
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(requestUrl, {
    method,
    headers: {
      Authorization: authorization,
      ...signingHeaders,
    },
    body: payload,
  });

  const responseBody = output === "arrayBuffer"
    ? new Uint8Array(await response.arrayBuffer())
    : await response.text();

  if (!response.ok) {
    const detail = typeof responseBody === "string" ? responseBody.slice(0, 800) : `${responseBody.byteLength} bytes`;
    throw new Error(`${method} ${requestUrl} failed: ${response.status} ${response.statusText}\n${detail}`);
  }

  return { response, body: responseBody, url: requestUrl.toString() };
}

const extractKeys = (xml) => [...xml.matchAll(/<Key>(.*?)<\/Key>/g)].map((match) => match[1]);
const extractBuckets = (xml) => [...xml.matchAll(/<Name>(.*?)<\/Name>/g)].map((match) => match[1]);

console.log("BlobSafe S3 validation");
console.log(`Endpoint: ${endpoint}`);
console.log(`Bucket:   ${bucket}`);
console.log(`Prefix:   ${prefix}`);
console.log("");

try {
  console.log("1. Listing configured buckets...");
  const buckets = await signedRequest({
    method: "GET",
    path: "/",
  });
  const bucketNames = extractBuckets(buckets.body);
  console.log(bucketNames.length ? bucketNames.map((name) => `  - ${name}`).join("\n") : "  No buckets returned.");

  console.log("");
  console.log("2. Listing BlobSafe namespace...");
  const query = new URLSearchParams({
    "list-type": "2",
    prefix,
  });
  const list = await signedRequest({
    method: "GET",
    path: `/${encodePath(bucket)}`,
    query,
  });
  const keys = extractKeys(list.body);
  console.log(keys.length ? keys.slice(0, 25).map((key) => `  - ${key}`).join("\n") : "  No objects returned under prefix.");
  if (keys.length > 25) console.log(`  ...and ${keys.length - 25} more`);

  if (objectKey) {
    console.log("");
    console.log("3. Reading object metadata...");
    const head = await signedRequest({
      method: "HEAD",
      path: `/${encodePath(bucket)}/${encodePath(objectKey)}`,
    });
    console.log(`  content-length: ${head.response.headers.get("content-length") || "unknown"}`);
    console.log(`  content-type:   ${head.response.headers.get("content-type") || "unknown"}`);

    console.log("");
    console.log("4. Downloading object...");
    const download = await signedRequest({
      method: "GET",
      path: `/${encodePath(bucket)}/${encodePath(objectKey)}`,
      output: "arrayBuffer",
    });
    const safeName = objectKey.replace(/[^a-zA-Z0-9._-]/g, "_");
    const outputPath = join(tmpdir(), `blobsafe-s3-${safeName}`);
    await writeFile(outputPath, download.body);
    console.log(`  downloaded: ${outputPath}`);
    console.log("  Public/plain objects should open directly; encrypted BlobSafe objects remain sealed bytes.");
  } else {
    console.log("");
    console.log("Optional: set BLOBSAFE_S3_OBJECT_KEY to head/download a specific object.");
  }

  if (putTest) {
    const testKey = `blobsafe/public/s3-validation/validator-${Date.now()}.txt`;
    const testBody = `BlobSafe S3 Gateway validation\n${new Date().toISOString()}\n`;
    console.log("");
    console.log("5. Writing validation object...");
    await signedRequest({
      method: "PUT",
      path: `/${encodePath(bucket)}/${encodePath(testKey)}`,
      body: testBody,
      headers: {
        "x-amz-meta-expiration-seconds": "2592000",
      },
    });
    console.log(`  wrote: ${testKey}`);

    console.log("");
    console.log("6. Reading validation object...");
    const readBack = await signedRequest({
      method: "GET",
      path: `/${encodePath(bucket)}/${encodePath(testKey)}`,
    });
    if (readBack.body !== testBody) {
      throw new Error("Read-back content did not match the written validation object.");
    }
    console.log("  read-back matched.");
    console.log("  This object is public/plain test data under blobsafe/public/s3-validation/.");
  }

  console.log("");
  console.log("S3 Gateway validation completed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
