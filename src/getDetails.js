import { Keypair } from 'stellar-sdk'

import { createJsonResponse, parseError } from './js/utils'
import Pool from './js/pg'
import AWS from 'aws-sdk'
import { compact } from 'lodash'

// TODO
// Add another collation get endpoint which gets a contract's turrets and returns an array response of all turret data

AWS.config.setPromisesDependency(Promise)

const s3 = new AWS.S3()

export default async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false

  try {
    const pgClient = await Pool.connect()

    const contracts = await pgClient.query(`
      SELECT contract, signer FROM contracts
   `).then((data) => data.rows || [])

    await pgClient.release()

    const contractsMeta = await Promise.all(
      contracts.map(
        contractDescriptor => s3.headObject({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: contractDescriptor.contract
        })
        .promise()
        .then(({Metadata: {fields, authkey}}) => ({
          contract: contractDescriptor.contract,
          authkey,
          signer: Keypair.fromSecret(contractDescriptor.signer).publicKey(),
          fields: fields ? JSON.parse(Buffer.from(fields, 'base64').toString('utf8')) : undefined,
        }))
        .catch(() => null) // Don't throw on missing contracts
      )
    )

    return createJsonResponse({
      vault: process.env.TURING_VAULT_ADDRESS,
      runFee: process.env.TURING_RUN_FEE,
      uploadFee: process.env.TURING_UPLOAD_FEE,
      network: process.env.STELLAR_NETWORK,
      contracts: compact(contractsMeta)
    })
  } catch (err) {
    return parseError(err)
  }
}