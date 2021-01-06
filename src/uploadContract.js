import { Transaction, Keypair, Networks, Asset, Server } from 'stellar-sdk'
import AWS from 'aws-sdk'
import middy from '@middy/core'
import httpMultipartBodyParser from '@tinyanvil/http-multipart-body-parser'
import httpHeaderNormalizer from '@middy/http-header-normalizer'
import doNotWaitForEmptyEventLoop from '@middy/do-not-wait-for-empty-event-loop'
import Promise from 'bluebird'
import { find } from 'lodash'
import shajs from 'sha.js'
import BigNumber from 'bignumber.js'

import { parseError, createJsonResponse } from './js/utils'
import Pool from './js/pg'

// DONE
// Contract hash should include fields as well as contract code
// Require TURRET_UPLOAD_FEE to be paid in a presigned txn to the TURRET_ADDRESS
// If fileSize limit is hit throw error
  // https://github.com/middyjs/middy/tree/master/packages/http-multipart-body-parser
  // https://github.com/mscdex/busboy/issues/76

AWS.config.setPromisesDependency(Promise)

const horizon = process.env.STELLAR_NETWORK === 'PUBLIC' ? 'https://horizon.stellar.org' : 'https://stellar-horizon-testnet.satoshipay.io/'
const server = new Server(horizon)

const config = {
  endpoint: new AWS.Endpoint('http://localhost:4566'),
  accessKeyId: 'foo',
  secretAccessKey: 'bar',
  region: 'us-east-1',
  s3ForcePathStyle: true
}

const s3 = new AWS.S3(config)

const originalHandler = async (event) => {
  try {
    const signer = Keypair.random()
    const codeHash = shajs('sha256').update(event.body.contract.content).update(event.body.fields || '').digest('hex')

    let Metadata

    if (event.body.fields)
      Metadata = {Fields: event.body.fields}

    await s3.putObject({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: codeHash,
      Body: event.body.contract.content,
      ContentType: event.body.contract.mimetype,
      ContentLength: event.body.contract.content.length,
      StorageClass: 'STANDARD',
      CacheControl: 'public; max-age=31536000',
      ACL: 'public-read',
      Metadata,
    }).promise()

    const pgClient = await Pool.connect()

    await pgClient.query(`
      INSERT INTO contracts (contract, signer)
      VALUES ($1, $2)
    `, [codeHash, signer.secret()])

    await pgClient.release()

    return createJsonResponse({
      hash: codeHash,
      turret: process.env.TURRET_ADDRESS,
      signer: signer.publicKey(),
      fee: process.env.TURRET_RUN_FEE
    })
  }

  catch(err) {
    throw err
  }
}

const handler = middy(originalHandler)

handler
.use(doNotWaitForEmptyEventLoop({
  runOnBefore: true,
  runOnAfter: true,
  runOnError: true
}))
.use(httpHeaderNormalizer())
.use(httpMultipartBodyParser({
  busboy: {
    limits: {
      fieldNameSize: 10,
      fieldSize: 1000,
      fields: 4,
      fileSize: 32e6, // 32 MB
      files: 1,
      parts: 5,
      headerPairs: 2
    }
  }
}))
.use({
  async before(handler) {
    if (
      handler.event.body.contract.mimetype !== 'application/javascript'
    ) throw 'Contract must be JavaScript'

    if (handler.event.body.contract.truncated)
      throw 'Contract file is too big'

    // Check if contract has already been uploaded
    const codeHash = shajs('sha256').update(handler.event.body.contract.content).update(handler.event.body.fields || '').digest('hex')

    const s3Contract = await s3.headObject({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: codeHash,
    }).promise().catch(() => null)

    const pgClient = await Pool.connect()

    const signerSecret = await pgClient.query(`
      SELECT contract FROM contracts
      WHERE contract = $1
    `, [codeHash]).then((data) => data.rows[0]).catch(() => null)

    await pgClient.release()

    if (
      s3Contract
      || signerSecret
    ) throw 'Contract already exists'
    ////

    // Check for and submit valid upload payment
    if (!process.env.TURRET_UPLOAD_FEE) return
    const transaction = new Transaction(handler.event.body.payment, Networks[process.env.STELLAR_NETWORK])
    const hash = transaction.hash().toString('hex')

    await server
    .transactions()
    .transaction(hash)
    .call()
    .catch((err) => err)
    .then((err) => {
      console.log("in then with err", err)
      if (
        err.response
        && err.response.status === 404
      ) return

      else if (err.response)
        throw err

      throw 'Transaction has already been submitted'
    })

    if (!find(transaction._operations, {
      type: 'payment',
      destination: process.env.TURRET_ADDRESS,
      amount: new BigNumber(process.env.TURRET_UPLOAD_FEE).toFixed(7),
      asset: Asset.native()
    })) throw 'Missing or invalid fee payment'

    await server.submitTransaction(transaction)
    ////

    return
  }
})
.use({
  onError(handler, next) {
    handler.response = parseError(handler.error)
    next()
  }
})

export default handler
