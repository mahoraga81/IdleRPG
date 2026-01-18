import { CloudflareSocket } from './net-mock';

export const connect = (opts: {
  autoSelectedFamily: boolean;
  host: string;
  port: number;
  servername: string;
}) => {
  // use socket.readable to read from the socket and write to m
  const cfSocket = new CloudflareSocket(true);
  cfSocket.connect(opts);
  return cfSocket;
};

export const tls = {
  connect: connect,
};

export default { ...tls };
