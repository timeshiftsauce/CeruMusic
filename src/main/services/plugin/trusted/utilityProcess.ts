import { MessageChannelMain, utilityProcess } from 'electron'
import type {
  TrustedProcessLaunch,
  TrustedProcessTransport
} from '@shiqianjiang/ceru-plugin-core/trusted'

/** The utility process is fully trusted, not a Node-permission sandbox. */
export function launchTrustedUtilityProcess({
  runner,
  directory,
  token
}: TrustedProcessLaunch): TrustedProcessTransport {
  const child = utilityProcess.fork(runner, [], {
    cwd: directory,
    serviceName: 'Ceru trusted plugin',
    stdio: 'pipe',
    env: {
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      CERU_TRUSTED_TOKEN: token
    },
    execArgv: []
  })
  const { port1, port2 } = new MessageChannelMain()
  const pending: { message: string; done: (error?: Error | null) => void }[] = []
  let ready = false,
    stopped = false
  let messageListener: ((message: unknown) => void) | undefined
  let disconnectListener: (() => void) | undefined
  const close = () => {
    if (stopped) return
    stopped = true
    port1.close()
    for (const item of pending.splice(0)) item.done(Error('Trusted utility process stopped'))
  }
  const send = (message: string, done: (error?: Error | null) => void) => {
    if (stopped) {
      done(Error('Trusted utility process stopped'))
      return
    }
    if (!ready) {
      pending.push({ message, done })
      return
    }
    try {
      port1.postMessage(message)
      done()
    } catch (error) {
      done(error as Error)
    }
  }
  port1.on('message', (event) => {
    if (!ready) {
      if (event.data?.type !== 'ceru-trusted-ready' || event.data?.token !== token) {
        close()
        child.kill()
        disconnectListener?.()
        return
      }
      ready = true
      for (const item of pending.splice(0)) send(item.message, item.done)
    } else messageListener?.(event.data)
  })
  port1.on('close', () => {
    if (!stopped) {
      close()
      disconnectListener?.()
    }
  })
  port1.start()
  child.once('spawn', () => {
    if (!stopped) child.postMessage({ type: 'ceru-trusted-port', token }, [port2])
  })
  child.once('exit', close)
  return {
    get pid() {
      return child.pid
    },
    send,
    kill: () => {
      close()
      child.kill()
    },
    onMessage: (listener) => {
      messageListener = listener
    },
    onExit: (listener) => {
      child.once('exit', (code) => listener(code))
    },
    // UtilityProcess does not have ChildProcess's 'error' event. Spawn failures
    // emit exit or are caught by the runtime's activation deadline.
    onError: () => {},
    onDisconnect: (listener) => {
      disconnectListener = listener
    },
    onStderr: (listener) => {
      child.stderr?.on('data', listener)
    }
  }
}
