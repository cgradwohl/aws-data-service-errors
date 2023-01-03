import { S3Client, AbortMultipartUploadCommand } from "@aws-sdk/client-s3";

// a client can be shared by different commands.
const client = new S3Client({ region: "REGION" });
