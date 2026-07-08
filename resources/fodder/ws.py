import socket, threading, select, signal, sys, time, getopt, os, re

# Listen
LISTENING_ADDR = '0.0.0.0'
if sys.argv[1:]:
    LISTENING_PORTS = [int(port) for port in sys.argv[1].split(',')]
else:
    LISTENING_PORTS = [10015]
# Passwd
PASS = ''

# CONST
BUFLEN = 4096 * 4
IDLE_TIMEOUT = 300
CLEANUP_INTERVAL = 120
DEFAULT_HOSTS = ['127.0.0.1:109', '127.0.0.1:2223', '127.0.0.1:2222', '127.0.0.1:1194']
RESPONSE = 'HTTP/1.1 101 Switching Protocol\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: foo\r\n\r\n'

class Server(threading.Thread):
    def __init__(self, host, ports):
        threading.Thread.__init__(self)
        self.running = False
        self.host = host
        self.ports = ports
        self.threads = []
        self.threadsLock = threading.Lock()
        self.logLock = threading.Lock()

    def run(self):
        self.socs = []
        for port in self.ports:
            soc = socket.socket(socket.AF_INET)
            soc.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            soc.settimeout(2)
            soc.bind((self.host, port))
            soc.listen(0)
            self.socs.append(soc)
        self.running = True

        # Cleanup stale mapping files
        def cleanup():
            while self.running:
                time.sleep(CLEANUP_INTERVAL)
                try:
                    _cutoff = time.time() - IDLE_TIMEOUT
                    for _e in os.listdir('/tmp/ws-ips/'):
                        _p = '/tmp/ws-ips/' + _e
                        try:
                            if os.stat(_p).st_mtime < _cutoff:
                                os.remove(_p)
                        except:
                            pass
                except:
                    pass
        threading.Thread(target=cleanup, daemon=True).start()

        try:
            while self.running:
                for soc in self.socs:
                    try:
                        c, addr = soc.accept()
                        c.setblocking(1)
                    except socket.timeout:
                        continue

                    conn = ConnectionHandler(c, self, addr)
                    conn.start()
                    self.addConn(conn)
        finally:
            self.running = False
            for soc in self.socs:
                soc.close()

    def printLog(self, log):
        self.logLock.acquire()
        print(log)
        self.logLock.release()

    def addConn(self, conn):
        try:
            self.threadsLock.acquire()
            if self.running:
                self.threads.append(conn)
        finally:
            self.threadsLock.release()

    def removeConn(self, conn):
        try:
            self.threadsLock.acquire()
            if conn in self.threads:
                self.threads.remove(conn)
        finally:
            self.threadsLock.release()

    def close(self):
        try:
            self.running = False
            self.threadsLock.acquire()

            threads = list(self.threads)
            for c in threads:
                c.close()
        finally:
            self.threadsLock.release()


class ConnectionHandler(threading.Thread):
    def __init__(self, socClient, server, addr):
        threading.Thread.__init__(self)
        self.clientClosed = False
        self.targetClosed = True
        self.client = socClient
        self.client_buffer = ''
        self.server = server
        self.log = 'Connection: ' + str(addr)
        self.real_ip = addr[0]
        self.is_ssh = False

    def close(self):
        # Keep mapping file for SSH detection
        # (cleanup thread removes stale entries)
        try:
            if not self.clientClosed:
                self.client.shutdown(socket.SHUT_RDWR)
                self.client.close()
        except:
            pass
        finally:
            self.clientClosed = True

        try:
            if not self.targetClosed:
                self.target.shutdown(socket.SHUT_RDWR)
                self.target.close()
        except:
            pass
        finally:
            self.targetClosed = True

    def run(self):
        try:
            self.client_buffer = self.client.recv(BUFLEN).decode()

            # HAProxy proxy protocol v1: "PROXY TCP4 X.X.X.X ...\r\n"
            if self.client_buffer.startswith('PROXY '):
                proxy_match = __import__('re').match(r'^PROXY (TCP4|TCP6) (\S+)', self.client_buffer)
                if proxy_match:
                    self.real_ip = proxy_match.group(2)
                    # Strip PROXY line from buffer
                    self.client_buffer = self.client_buffer[self.client_buffer.find('\r\n')+2:]

            # Fallback: X-Forwarded-For or X-Real-IP HTTP header
            if self.real_ip == '127.0.0.1':
                xff = self.findHeader(self.client_buffer, 'X-Forwarded-For')
                if xff:
                    self.real_ip = xff.split(',')[0].strip()
                else:
                    xri = self.findHeader(self.client_buffer, 'X-Real-IP')
                    if xri:
                        self.real_ip = xri.split(',')[0].strip()

            hostPort = self.findHeader(self.client_buffer, 'X-Real-Host')

            if hostPort == '':
                if 'SSH-' in self.client_buffer[:64]:
                    self.is_ssh = True
                    hostPort = DEFAULT_HOSTS[2]  # 127.0.0.1:2222
                else:
                    hostPort = DEFAULT_HOSTS[0]

            split = self.findHeader(self.client_buffer, 'X-Split')

            if split != '':
                self.client.recv(BUFLEN)

            if hostPort != '':
                self.method_CONNECT(hostPort)
            else:
                print('- No X-Real-Host!')
                try:
                    self.client.send('HTTP/1.1 400 NoXRealHost!\r\n\r\n'.encode())
                except (BrokenPipeError, OSError, socket.error):
                    pass

        except Exception as e:
            self.log += ' - error: ' + str(e)
            self.server.printLog(self.log)
            pass
        finally:
            if not self.is_ssh and not self.clientClosed:
                try:
                    self.client.sendall(RESPONSE.encode())
                except (BrokenPipeError, OSError, socket.error):
                    pass
            self.close()
            self.server.removeConn(self)

    def findHeader(self, head, header):
        aux = head.find(header + ': ')

        if aux == -1:
            return ''

        aux = head.find(':', aux)
        head = head[aux+2:]
        aux = head.find('\r\n')

        if aux == -1:
            return ''

        return head[:aux]

    def connect_target(self, host):
        i = host.find(':')
        if i != -1:
            port = int(host[i+1:])
            host = host[:i]
        else:
            if self.method == 'CONNECT':
                port = 443
            else:
                port = sys.argv[1]

        (soc_family, soc_type, proto, _, address) = socket.getaddrinfo(host, port)[0]

        self.target = socket.socket(soc_family, soc_type, proto)
        self.targetClosed = False
        self.target.connect(address)

    def method_CONNECT(self, path):
        self.log += ' - CONNECT ' + path

        self.connect_target(path)
        # Write real IP mapping (port-based — key = ws.py local port)
        try:
            local_port = str(self.target.getsockname()[1])
            os.makedirs('/tmp/ws-ips', exist_ok=True)
            with open('/tmp/ws-ips/' + local_port, 'w') as f:
                f.write(self.real_ip + '\n')
        except:
            pass
        if not self.is_ssh:
            # HTTP tunnel: send 101 Switching, clear buffer, then pipe
            try:
                self.client.sendall(RESPONSE.encode())
            except (BrokenPipeError, OSError, socket.error):
                return
            self.client_buffer = ''
        else:
            # SSH tunnel: forward already-buffered SSH banner to target, no HTTP response
            try:
                self.target.sendall(self.client_buffer.encode())
            except (BrokenPipeError, OSError, socket.error):
                self.close()
                return
            self.client_buffer = ''

        self.server.printLog(self.log)
        self.doCONNECT()

    def doCONNECT(self):
        socs = [self.client, self.target]
        idle = 0
        while True:
            recv, _, err = select.select(socs, [], socs, 3)
            if err:
                break
            if recv:
                idle = 0
                for in_ in recv:
                    try:
                        data = in_.recv(BUFLEN)
                        if data:
                            if in_ is self.target:
                                try:
                                    self.client.send(data)
                                except (BrokenPipeError, OSError, socket.error):
                                    self.close()
                                    return
                            else:
                                try:
                                    while data:
                                        byte = self.target.send(data)
                                        data = data[byte:]
                                except (BrokenPipeError, OSError, socket.error):
                                    self.close()
                                    return
                        else:
                            self.close()
                            return
                    except:
                        self.close()
                        return
            else:
                idle += 3
                if idle >= IDLE_TIMEOUT:
                    self.close()
                    return


def print_usage():
    print('Usage: proxy.py -p <port1,port2,...>')
    print('       proxy.py -b <bindAddr> -p <port1,port2,...>')
    print('       proxy.py -b 0.0.0.0 -p 80,443')

def parse_args(argv):
    global LISTENING_ADDR
    global LISTENING_PORTS
    
    try:
        opts, args = getopt.getopt(argv, "hb:p:", ["bind=", "port="])
    except getopt.GetoptError:
        print_usage()
        sys.exit(2)
    for opt, arg in opts:
        if opt == '-h':
            print_usage()
            sys.exit()
        elif opt in ("-b", "--bind"):
            LISTENING_ADDR = arg
        elif opt in ("-p", "--port"):
            LISTENING_PORTS = [int(port) for port in arg.split(',')]


def main(host=LISTENING_ADDR, ports=LISTENING_PORTS):
    print("\n:-------PythonProxy-------:\n")
    print("Listening addr: " + LISTENING_ADDR)
    print("Listening ports: " + ', '.join(map(str, LISTENING_PORTS)) + "\n")
    print(":-------------------------:\n")
    server = Server(LISTENING_ADDR, LISTENING_PORTS)
    server.start()
    while True:
        try:
            time.sleep(2)
        except KeyboardInterrupt:
            print('Stopping...')
            server.close()
            break

#######    parse_args(sys.argv[1:])
if __name__ == '__main__':
    main()