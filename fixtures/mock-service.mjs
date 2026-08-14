import { createServer } from 'node:http'

const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html' })
  response.end('<!doctype html><title>fixture</title>')
})

server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  process.stdout.write(`fixture ready at http://127.0.0.1:${address.port}\n`)
})

process.on('message', message => {
  if (message?.type !== 'shutdown') return
  server.close(() => process.exit(0))
})
