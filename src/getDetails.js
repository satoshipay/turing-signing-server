import { Keypair } from 'stellar-sdk'
import AWS from 'aws-sdk'
import { compact } from 'lodash'
import Promise from 'bluebird'

import { createJsonResponse, parseError } from './js/utils'
import s3 from './js/s3'
import Pool from './js/pg'

AWS.config.setPromisesDependency(Promise)

export default async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false

  try {
    const pgClient = await Pool.connect()

    const pgContracts = await pgClient.query(`
      SELECT contract, signer FROM contracts
   `).then((data) => data.rows || [])

    await pgClient.release()

    const contracts = await new Promise.map(pgContracts, ({contract, signer}) =>
      s3.headObject({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: contract
      })
      .promise()
      .then(({Metadata: {fields}}) => ({
        contract: contract,
        signer: Keypair.fromSecret(signer).publicKey(),
        fields: fields ? JSON.parse(Buffer.from(fields, 'base64').toString('utf8')) : undefined,
      }))
      .catch(() => null)
    ).then((contracts) => compact(contracts)) // Don't throw on missing contracts

    return createJsonResponse({
      turret: process.env.TURRET_ADDRESS,
      runFee: process.env.TURRET_RUN_FEE,
      uploadFee: process.env.TURRET_UPLOAD_FEE,
      network: process.env.STELLAR_NETWORK,
      contracts
    })
  } catch (err) {
    return parseError(err)
  }
}
