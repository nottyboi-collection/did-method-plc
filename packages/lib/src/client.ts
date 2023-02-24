import axios from 'axios'
import { CID } from 'multiformats/cid'
import { Keypair } from '@atproto/crypto'
import { check, cidForCbor } from '@atproto/common'
import * as operations from './operations'
import * as t from './types'

export class Client {
  constructor(public url: string) {}

  async getDocument(did: string): Promise<t.DidDocument> {
    const res = await axios.get(`${this.url}/${encodeURIComponent(did)}`)
    return res.data
  }

  async getDocumentData(did: string): Promise<t.DocumentData> {
    const res = await axios.get(`${this.url}/data/${encodeURIComponent(did)}`)
    return res.data
  }

  async getOperationLog(did: string): Promise<t.Operation[]> {
    const res = await axios.get(`${this.url}/log/${encodeURIComponent(did)}`)
    return res.data.log
  }

  postOpUrl(did: string): string {
    return `${this.url}/${encodeURIComponent(did)}`
  }

  async sendOperation(did: string, op: t.Operation) {
    await axios.post(this.postOpUrl(did), op)
  }

  async formatCreateOp(
    signingKey: Keypair,
    recoveryKey: string,
    handle: string,
    service: string,
  ): Promise<{ op: t.CreateOp; did: string }> {
    const op = await operations.create(signingKey, recoveryKey, handle, service)
    if (!check.is(op, t.def.createOp)) {
      throw new Error('Not a valid create operation')
    }
    const did = await operations.didForCreateOp(op)
    return { did, op }
  }

  async createDid(
    signingKey: Keypair,
    recoveryKey: string,
    handle: string,
    service: string,
  ): Promise<string> {
    const { op, did } = await this.formatCreateOp(
      signingKey,
      recoveryKey,
      handle,
      service,
    )
    await this.sendOperation(did, op)
    return did
  }

  async getPrev(did): Promise<CID> {
    const log = await this.getOperationLog(did)
    if (log.length === 0) {
      throw new Error(`Could not make update: DID does not exist: ${did}`)
    }
    return cidForCbor(log[log.length - 1])
  }

  async rotateSigningKey(
    did: string,
    newKey: string,
    signingKey: Keypair,
    prev?: CID,
  ) {
    prev = prev ? prev : await this.getPrev(did)
    const op = await operations.rotateSigningKey(
      newKey,
      prev.toString(),
      signingKey,
    )
    await this.sendOperation(did, op)
  }

  async rotateRecoveryKey(
    did: string,
    newKey: string,
    signingKey: Keypair,
    prev?: CID,
  ) {
    prev = prev ? prev : await this.getPrev(did)
    const op = await operations.rotateRecoveryKey(
      newKey,
      prev.toString(),
      signingKey,
    )
    await this.sendOperation(did, op)
  }

  async updateHandle(did: string, handle: string, signingKey: Keypair) {
    const prev = await this.getPrev(did)
    const op = await operations.updateHandle(
      handle,
      prev.toString(),
      signingKey,
    )
    await this.sendOperation(did, op)
  }

  async updateAtpPds(did: string, service: string, signingKey: Keypair) {
    const prev = await this.getPrev(did)
    const op = await operations.updateAtpPds(
      service,
      prev.toString(),
      signingKey,
    )
    await this.sendOperation(did, op)
  }

  async health() {
    return await axios.get(`${this.url}/_health`)
  }
}

export default Client