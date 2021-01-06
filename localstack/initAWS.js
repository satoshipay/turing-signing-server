const AWS = require("aws-sdk");

const s3 = new AWS.S3({
  apiVersion: "2015-03-31",
  accessKeyId: "foo",
  secretAccessKey: "bar",
  region: "us-east-1",
  endpoint: "http://localhost:4566",
  s3ForcePathStyle: true,
});

function createBucket(name) {
  s3.createBucket({ Bucket: name }, function (err, bucket) {
    if (err) {
      console.log("Error", err);
    } else {
      console.log("Sucessfully created bucket", name);
    }
  });
}

const baseName = "turing-signing-server";
const instancesCount = 5;

for (let i = 0; i < instancesCount; i++) {
  const bucketName = `${baseName}-${i}`;
  createBucket(bucketName);
}
