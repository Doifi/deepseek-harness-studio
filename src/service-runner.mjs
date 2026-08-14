import { pathToFileURL } from 'node:url'

const [, , cliPath, ...cliArgs] = process.argv
if (cliPath === undefined) throw new Error('desktop service runner: missing dsh CLI path')

let shutdownTimer
const forwardShutdown = () => {
  if (process.listenerCount('SIGTERM') > 0) {
    process.emit('SIGTERM')
    return
  }
  if (shutdownTimer !== undefined) return
  shutdownTimer = setInterval(() => {
    if (process.listenerCount('SIGTERM') === 0) return
    clearInterval(shutdownTimer)
    shutdownTimer = undefined
    process.emit('SIGTERM')
  }, 25)
  shutdownTimer.unref()
}

process.on('message', message => {
  if (message?.type === 'shutdown') forwardShutdown()
})

process.argv = [process.execPath, cliPath, ...cliArgs]
await import(pathToFileURL(cliPath).href)
