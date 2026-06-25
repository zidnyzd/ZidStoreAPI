#!/bin/bash

# Fetch URL from the first argument
data_acc="https://zds.web.id/api/exp?key="
data_key=$(cat /root/.key)

status_code=$(curl -s -o /dev/null -w "%{http_code}" $data_acc$data_key)

if [ $status_code -eq 200 ]; then
  expiry_date=$(date -d "$(curl -s $data_acc$data_key)" +%s)
  current_date=$(date +%s)
  remaining_days=$(((expiry_date - current_date) / 86400))

  if [ $expiry_date -gt $current_date ]; then
    # Function to get information from config file
    get_config_info_123() {
      config_file=$1
      default_value=$2
      if [ ! -f "$config_file" ]; then
        echo "$default_value"
      else
        cat "$config_file"
      fi
    }

    # Get configuration information
    domain=$(get_config_info_123 "/etc/xray/domain" "Domain not found")
    ns_domain=$(get_config_info_123 "/etc/xray/dns" "NS Domain not found")
    city=$(get_config_info_123 "/etc/xray/city" "Location not found")
    public_key=$(get_config_info_123 "/etc/slowdns/server.pub" "Public key not found")
    uuid=$(cat /proc/sys/kernel/random/uuid)
    exp=$(date -d "$duration days" +"%Y-%m-%d")
    account_type=$1

    # Validate input
    validate_input_110() {
      if ! [[ "$account_type" =~ ^(vmess|vless|trojan|shadowsocks|ssh)$ ]]; then
        echo '{"status": "error", "message": "Invalid account type"}'
        exit 1
      fi
    }

    # Function to create Vmess account
    create_vmess_117() {
      local username=$2
      local duration=$3
      local quota=$4
      local ip_limit=$5
      expiration_date=$(date -d "$duration days" +"%Y-%m-%d")
      # Check if username already exists
      if grep -q "^### $username " /etc/xray/vmess/config.json; then
        username="$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 5)${username}"
      fi
      # Create configuration files
      cat >/etc/xray/vmess/$username-tls.json <<EOF
{
    "v": "2",
    "ps": "$username WS (CDN) TLS",
    "add": "${domain}",
    "port": "443",
    "id": "${uuid}",
    "aid": "0",
    "net": "ws",
    "path": "/whatever/vmess",
    "type": "none",
    "host": "${domain}",
    "tls": "tls"
}
EOF

      cat >/etc/xray/vmess/$username-non.json <<EOF
{
    "v": "2",
    "ps": "$username WS (CDN) NTLS",
    "add": "${domain}",
    "port": "80",
    "id": "${uuid}",
    "aid": "0",
    "net": "ws",
    "path": "/whatever/vmess",
    "type": "none",
    "host": "${domain}",
    "tls": "none"
}
EOF

      cat >/etc/xray/vmess/$username-grpc.json <<EOF
{
    "v": "2",
    "ps": "$username (SNI) GRPC",
    "add": "${domain}",
    "port": "443",
    "id": "${uuid}",
    "aid": "0",
    "net": "grpc",
    "path": "vmess-grpc",
    "type": "none",
    "host": "${domain}",
    "tls": "tls"
}
EOF

      # Cek apakah file konfigurasi ada sebelum melakukan base64
      if [[ -f /etc/xray/vmess/$username-tls.json && -f /etc/xray/vmess/$username-non.json && -f /etc/xray/vmess/$username-grpc.json ]]; then
        vmess_tls_link="vmess://$(base64 -w 0 /etc/xray/vmess/$username-tls.json)"
        vmess_nontls_link="vmess://$(base64 -w 0 /etc/xray/vmess/$username-non.json)"
        vmess_grpc_link="vmess://$(base64 -w 0 /etc/xray/vmess/$username-grpc.json)"
      else
        echo '{"status": "error", "message": "File konfigurasi tidak ditemukan"}'
        exit 1
      fi

      db_file="/etc/xray/vmess/.vmess.db"
      echo "### $username $expiration_date $uuid" >>"$db_file"

      if [[ $quota != "0" ]]; then
        echo "$((quota * 1024 * 1024 * 1024))" >"/etc/xray/vmess/$username"
        echo "$ip_limit" >"/etc/xray/vmess/${username}IP"
      fi

      # Save account to config.json
      if ! sed -i '/#vmess$/a\### '"$username $expiration_date"'\
},{"id": "'""$uuid""'","alterId": '"0"',"email": "'""$username""'"' /etc/xray/vmess/config.json; then
        echo '{"status": "error", "message": "Failed to add account to config.json"}'
        exit 1
      fi
      if ! sed -i '/#vmessgrpc$/a\### '"$username $expiration_date"'\
},{"id": "'""$uuid""'","alterId": '"0"',"email": "'""$username""'"' /etc/xray/vmess/config.json; then
        echo '{"status": "error", "message": "Failed to add account to config.json"}'
        exit 1
      fi
      # Create configuration file for OpenClash
      cat >/var/www/html/vmess-$username.txt <<-END
---------------------
# Format Vmess WS (CDN)
---------------------

- name: Vmess-$username-WS (CDN)
  type: vmess
  server: ${domain}
  port: 443
  uuid: ${uuid}
  alterId: 0
  cipher: auto
  udp: true
  tls: true
  skip-cert-verify: true
  servername: ${domain}
  network: ws
  ws-opts:
    path: /whatever/vmess
    headers:
      Host: ${domain}
---------------------
# Format Vmess WS (CDN) Non TLS
---------------------

- name: Vmess-$username-WS (CDN) Non TLS
  type: vmess
  server: ${domain}
  port: 80
  uuid: ${uuid}
  alterId: 0
  cipher: auto
  udp: true
  tls: false
  skip-cert-verify: false
  servername: ${domain}
  network: ws
  ws-opts:
    path: /whatever/vmess
    headers:
      Host: ${domain}
---------------------
# Format Vmess gRPC (SNI)
---------------------

- name: Vmess-$username-gRPC (SNI)
  server: ${domain}
  port: 443
  type: vmess
  uuid: ${uuid}
  alterId: 0
  cipher: auto
  network: grpc
  tls: true
  servername: ${domain}
  skip-cert-verify: true
  grpc-opts:
    grpc-service-name: vmess-grpc

---------------------
# Vmess Account Links
---------------------
TLS Link : vmess://$(base64 -w 0 /etc/xray/vmess/$username-tls.json)
---------------------
Non-TLS Link : vmess://$(base64 -w 0 /etc/xray/vmess/$username-non.json)
---------------------
GRPC Link : vmess://$(base64 -w 0 /etc/xray/vmess/$username-grpc.json)
---------------------

END
      echo "{
        \"status\": \"success\",
        \"message\": \"Vmess account successfully created\",
        \"data\": {
            \"username\": \"$username\",
            \"expired\": \"$expiration_date\",
            \"uuid\": \"$uuid\",
            \"quota\": \"$quota GB\",
            \"ip_limit\": \"$ip_limit\",
            \"domain\": \"$domain\",
            \"ns_domain\": \"$ns_domain\",
            \"city\": \"$city\",
            \"pubkey\": \"$public_key\",
            \"vmess_tls_link\": \"$vmess_tls_link\",
            \"vmess_nontls_link\": \"$vmess_nontls_link\", 
            \"vmess_grpc_link\": \"$vmess_grpc_link\"
        }
    }"
    }

    # Function to create Vless account
    create_vless_121() {
      local username=$2
      local duration=$3
      local quota=$4
      local ip_limit=$5
      expiration_date=$(date -d "$duration days" +"%Y-%m-%d")
      if grep -q "^### $username " /etc/xray/vless/config.json; then
        username="$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 5)${username}"
      fi
      vless_tls_link="vless://${uuid}@${domain}:443?path=/whatever/vless&security=tls&encryption=none&host=${domain}&type=ws&sni=${domain}#${username}"
      vless_nontls_link="vless://${uuid}@${domain}:80?path=/whatever/vless&encryption=none&host=${domain}&type=ws#${username}"
      vless_grpc_link="vless://${uuid}@${domain}:443?mode=gun&security=tls&encryption=none&type=grpc&serviceName=vless-grpc&sni=${domain}#${username}"

      db_file="/etc/xray/vless/.vless.db"
      echo "### $username $expiration_date $uuid" >>"$db_file"

      if [[ $quota != "0" ]]; then
        echo "$((quota * 1024 * 1024 * 1024))" >"/etc/xray/vless/$username"
        echo "$ip_limit" >"/etc/xray/vless/${username}IP"
      fi
      # Save account to config.json
      if ! sed -i '/#vless$/a\### '"$username $expiration_date"'\
},{"id": "'""$uuid""'","email": "'""$username""'"' /etc/xray/vless/config.json; then
        echo '{"status": "error", "message": "Failed to add account to config.json"}'
        exit 1
      fi
      if ! sed -i '/#vlessgrpc$/a\### '"$username $expiration_date"'\
},{"id": "'""$uuid""'","email": "'""$username""'"' /etc/xray/vless/config.json; then
        echo '{"status": "error", "message": "Failed to add account to config.json"}'
        exit 1
      fi

      # Create configuration file for OpenClash
      cat >/var/www/html/vless-$username.txt <<-END
---------------------
# Vless WS (CDN) Format
---------------------

- name: Vless-$username-WS (CDN)
  type: vless
  server: ${domain}
  port: 443
  uuid: ${uuid}
  cipher: auto
  udp: true
  tls: true
  skip-cert-verify: true
  servername: ${domain}
  network: ws
  ws-opts:
    path: /whatever/vless
    headers:
      Host: ${domain}
---------------------
# Vless WS (CDN) Non TLS Format
---------------------

- name: Vless-$username-WS (CDN) Non TLS
  type: vless
  server: ${domain}
  port: 80
  uuid: ${uuid}
  cipher: auto
  udp: true
  tls: false
  skip-cert-verify: false
  servername: ${domain}
  network: ws
  ws-opts:
    path: /whatever/vless
    headers:
      Host: ${domain}
---------------------
# Vless gRPC (SNI) Format
---------------------

- name: Vless-$username-gRPC (SNI)
  server: ${domain}
  port: 443
  type: vless
  uuid: ${uuid}
  cipher: auto
  network: grpc
  tls: true
  servername: ${domain}
  skip-cert-verify: true
  grpc-opts:
    grpc-service-name: vless-grpc

---------------------
# Vless Account Links
---------------------
TLS Link : vless://${uuid}@${domain}:443?path=/whatever/vless&security=tls&encryption=none&host=${domain}&type=ws#${username}-WS-TLS
---------------------
Non-TLS Link : vless://${uuid}@${domain}:80?path=/whatever/vless&encryption=none&host=${domain}&type=ws#${username}-WS-NTLS
---------------------
GRPC Link : vless://${uuid}@${domain}:443?mode=gun&security=tls&encryption=none&type=grpc&serviceName=vless-grpc&sni=${domain}#${username}-gRPC
---------------------

END

      echo "{
        \"status\": \"success\",
        \"message\": \"Vless account successfully created\",
        \"data\": {
            \"username\": \"$username\",
            \"expired\": \"$expiration_date\",
            \"uuid\": \"$uuid\",
            \"quota\": \"$quota GB\",
            \"ip_limit\": \"$ip_limit\",
            \"domain\": \"$domain\",
            \"ns_domain\": \"$ns_domain\",
            \"city\": \"$city\",
            \"pubkey\": \"$public_key\",
            \"vless_tls_link\": \"$vless_tls_link\",
            \"vless_nontls_link\": \"$vless_nontls_link\",
            \"vless_grpc_link\": \"$vless_grpc_link\"
        }
    }"
    }

    # Function to create Trojan account
    create_trojan_125() {
      local username=$2
      local duration=$3
      local quota=$4
      local ip_limit=$5
      expiration_date=$(date -d "$duration days" +"%Y-%m-%d")
      if grep -q "^### $username " /etc/xray/trojan/config.json; then
        username="$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 5)${username}"
      fi
      trojan_tls_link="trojan://${uuid}@${domain}:443?path=%2Fwhatever%2Ftrojan-ws&security=tls&host=${domain}&type=ws&sni=${domain}#${username}"
      trojan_grpc_link="trojan://${uuid}@${domain}:443?mode=gun&security=tls&type=grpc&serviceName=trojan-grpc&sni=${domain}#${username}"

      db_file="/etc/xray/trojan/.trojan.db"
      echo "### $username $expiration_date $uuid" >>"$db_file"

      if [[ $quota != "0" ]]; then
        echo "$((quota * 1024 * 1024 * 1024))" >"/etc/xray/trojan/$username"
        echo "$ip_limit" >"/etc/xray/trojan/${username}IP"
      fi
      # Save account to config.json
      if ! sed -i '/#trojan$/a\### '"$username $expiration_date"'\
},{"password": "'""$uuid""'","email": "'""$username""'"' /etc/xray/trojan/config.json; then
        echo '{"status": "error", "message": "Failed to add account to config.json"}'
        exit 1
      fi
      if ! sed -i '/#trojangrpc$/a\### '"$username $expiration_date"'\
},{"password": "'""$uuid""'","email": "'""$username""'"' /etc/xray/trojan/config.json; then
        echo '{"status": "error", "message": "Failed to add account to config.json"}'
        exit 1
      fi

      # Create configuration file for OpenClash
      cat >/var/www/html/trojan-$username.txt <<-END
---------------------
# Format Trojan WS (CDN)
---------------------

- name: Trojan-$username-WS (CDN)
  type: trojan
  server: ${domain}
  port: 443
  password: ${uuid}
  udp: true
  sni: ${domain}
  skip-cert-verify: true
  network: ws
  ws-opts:
    path: /whatever/trojan-ws
    headers:
      Host: ${domain}
---------------------
# Format Trojan WS (CDN) Non TLS
---------------------

- name: Trojan-$username-WS (CDN) Non TLS
  type: trojan
  server: ${domain}
  port: 80
  password: ${uuid}
  udp: true
  sni: ${domain}
  skip-cert-verify: false
  network: ws
  ws-opts:
    path: /whatever/trojan-ws
    headers:
      Host: ${domain}
---------------------
# Format Trojan gRPC (SNI)
---------------------

- name: Trojan-$username-gRPC (SNI)
  server: ${domain}
  port: 443
  type: trojan
  password: ${uuid}
  network: grpc
  sni: ${domain}
  skip-cert-verify: true
  grpc-opts:
    grpc-service-name: trojan-grpc

---------------------
# Trojan Account Links
---------------------
TLS Link : trojan://${uuid}@${domain}:443?path=%2Fwhatever%2Ftrojan-ws&security=tls&host=${domain}&type=ws&sni=${domain}#${username}
---------------------
GRPC Link : trojan://${uuid}@${domain}:443?mode=gun&security=tls&type=grpc&serviceName=trojan-grpc&sni=${domain}#${username}
---------------------

END

      echo "{
        \"status\": \"success\", 
        \"message\": \"Trojan account successfully created\",
        \"data\": {
            \"username\": \"$username\",
            \"expired\": \"$expiration_date\",
            \"uuid\": \"$uuid\",
            \"quota\": \"$quota GB\",
            \"ip_limit\": \"$ip_limit\",
            \"domain\": \"$domain\",
            \"ns_domain\": \"$ns_domain\",
            \"city\": \"$city\",
            \"pubkey\": \"$public_key\",
            \"trojan_tls_link\": \"$trojan_tls_link\",
            \"trojan_grpc_link\": \"$trojan_grpc_link\"
        }
    }"
    }

    # Function to create Shadowsocks account
    create_shadowsocks_128() {
      local username=$2
      local duration=$3
      local quota=$4
      local ip_limit=$5
      local password=$(openssl rand -base64 16)
      local method="aes-256-gcm"
      expiration_date=$(date -d "$duration days" +"%Y-%m-%d")
      if grep -q "^### $username " /etc/xray/shadowsocks/config.json; then
        username="$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 5)${username}"
      fi
      encoded_credentials=$(echo -n "${method}:${password}" | base64 -w 0)
      ss_link_ws="ss://${encoded_credentials}@${domain}:443?plugin=xray-plugin;mux=0;path=/shadowsocks;host=${domain};tls;network=ws;host=$domain#${username}-WS"
      ss_link_grpc="ss://${encoded_credentials}@${domain}:443?plugin=xray-plugin;mux=0;serviceName=ss-grpc;host=${domain};tls#${username}-gRPC"

      db_file="/etc/xray/shadowsocks/.shadowsocks.db"
      echo "### $username $expiration_date $uuid" >>"$db_file"

      if [[ $quota != "0" ]]; then
        echo "$((quota * 1024 * 1024 * 1024))" >"/etc/xray/shadowsocks/$username"
        echo "$ip_limit" >"/etc/xray/shadowsocks/${username}IP"
      fi
      # Save account to config.json
      if ! sed -i '/#ssws$/a\### '"$username $expiration_date"'\
},{"password": "'""$password""'","method": "'""$method""'","email": "'""$username""'"' /etc/xray/shadowsocks/config.json; then
        echo '{"status": "error", "message": "Failed to add account to config.json"}'
        exit 1
      fi
      if ! sed -i '/#ssgrpc$/a\### '"$username $expiration_date"'\
},{"password": "'""$password""'","method": "'""$method""'","email": "'""$username""'"' /etc/xray/shadowsocks/config.json; then
        echo '{"status": "error", "message": "Failed to add account to config.json"}'
        exit 1
      fi
      # Create JSON config file
      cat >/var/www/html/shadowsocks-$username.txt <<-END
---------------------
# Shadowsocks WS Format
---------------------

{
 "dns": {
    "servers": [
      "8.8.8.8",
      "8.8.4.4"
    ]
  },
 "inbounds": [
   {
      "port": 10808,
      "protocol": "socks",
      "settings": {
        "auth": "noauth",
        "udp": true,
        "userLevel": 8
      },
      "sniffing": {
        "destOverride": [
          "http",
          "tls"
        ],
        "enabled": true
      },
      "tag": "socks"
    },
    {
      "port": 10809,
      "protocol": "http",
      "settings": {
        "userLevel": 8
      },
      "tag": "http"
    }
  ],
  "log": {
    "loglevel": "none"
  },
  "outbounds": [
    {
      "mux": {
        "enabled": true
      },
      "protocol": "shadowsocks",
      "settings": {
        "servers": [
          {
            "address": "$domain",
            "level": 8,
            "method": "$method",
            "password": "$uuid",
            "port": 443
          }
        ]
      },
      "streamSettings": {
        "network": "ws",
        "security": "tls",
        "tlsSettings": {
          "allowInsecure": true,
          "serverName": "$domain"
        },
        "wsSettings": {
          "headers": {
            "Host": "$domain"
          },
          "path": "/whatever/ss-ws"
        }
      },
      "tag": "proxy"
    },
    {
      "protocol": "freedom",
      "settings": {},
      "tag": "direct"
    },
    {
      "protocol": "blackhole",
      "settings": {
        "response": {
          "type": "http"
        }
      },
      "tag": "block"
    }
  ],
  "policy": {
    "levels": {
      "8": {
        "connIdle": 300,
        "downlinkOnly": 1,
        "handshake": 4,
        "uplinkOnly": 1
      }
    },
    "system": {
      "statsOutboundUplink": true,
      "statsOutboundDownlink": true
    }
  },
  "routing": {
    "domainStrategy": "Asls",
"rules": []
  },
  "stats": {}
 }

---------------------
# Shadowsocks gRPC Format
---------------------

{
    "dns": {
    "servers": [
      "8.8.8.8",
      "8.8.4.4"
    ]
  },
 "inbounds": [
   {
      "port": 10808,
      "protocol": "socks",
      "settings": {
        "auth": "noauth",
        "udp": true,
        "userLevel": 8
      },
      "sniffing": {
        "destOverride": [
          "http",
          "tls"
        ],
        "enabled": true
      },
      "tag": "socks"
    },
    {
      "port": 10809,
      "protocol": "http",
      "settings": {
        "userLevel": 8
      },
      "tag": "http"
    }
  ],
  "log": {
    "loglevel": "none"
  },
  "outbounds": [
    {
      "mux": {
        "enabled": true
      },
      "protocol": "shadowsocks",
      "settings": {
        "servers": [
          {
            "address": "$domain",
            "level": 8,
            "method": "$method",
            "password": "$uuid",
            "port": 443
          }
        ]
      },
      "streamSettings": {
        "grpcSettings": {
          "multiMode": true,
          "serviceName": "ss-grpc"
        },
        "network": "grpc",
        "security": "tls",
        "tlsSettings": {
          "allowInsecure": true,
          "serverName": "$domain"
        }
      },
      "tag": "proxy"
    },
    {
      "protocol": "freedom",
      "settings": {},
      "tag": "direct"
    },
    {
      "protocol": "blackhole",
      "settings": {
        "response": {
          "type": "http"
        }
      },
      "tag": "block"
    }
  ],
  "policy": {
    "levels": {
      "8": {
        "connIdle": 300,
        "downlinkOnly": 1,
        "handshake": 4,
        "uplinkOnly": 1
      }
    },
    "system": {
      "statsOutboundUplink": true,
      "statsOutboundDownlink": true
    }
  },
  "routing": {
    "domainStrategy": "Asls",
"rules": []
  },
  "stats": {}
}

---------------------
# Shadowsocks Account Links
---------------------
TLS Link : ${ss_link_ws}
---------------------
gRPC Link : ${ss_link_grpc}
---------------------

END
      echo "{
        \"status\": \"success\",
        \"message\": \"Shadowsocks account successfully created\",
        \"data\": {
            \"username\": \"$username\",
            \"expired\": \"$expiration_date\",
            \"password\": \"$password\",
            \"method\": \"$method\",
            \"quota\": \"$quota GB\",
            \"ip_limit\": \"$ip_limit\",
            \"domain\": \"$domain\",
            \"ns_domain\": \"$ns_domain\",
            \"city\": \"$city\",
            \"pubkey\": \"$public_key\",
            \"ss_link_ws\": \"$ss_link_ws\",
            \"ss_link_grpc\": \"$ss_link_grpc\"
        }
    }"
    }

    # Function to create SSH account
    create_ssh_134() {
      local username=$2
      local password=$3
      local expiration_date=$4
      local ip_limit=$5
      if grep -q "^### $username " /etc/ssh/.ssh.db; then
        username="$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 5)${username}"
      fi
      useradd -e "$(date -d "$expiration_date days" +"%Y-%m-%d")" -s /bin/false -M "$username"
      echo -e "$password\n$password\n" | passwd "$username" &>/dev/null
      exp="$(chage -l "$username" | grep "Account expires" | awk -F": " '{print $2}')"

      if [[ "$ip_limit" != "0" ]]; then
        echo "$ip_limit" >"/etc/ssh/$username"
      fi
      echo "### $username $(date -d "$expiration_date days" +"%Y-%m-%d")" >>"/etc/ssh/.ssh.db"

      # Create configuration file
      cat >/var/www/html/ssh-$username.txt <<END
---------------------
SSH OVPN Account Details
---------------------
Username         : $username
Password         : $password
---------------------
IP               : $ip
Host             : $domain
Slowdns Host     : ${ns_domain}
Public Key       : ${public_key}
Location         : $city
OpenSSH Port     : 443, 80, 22
UdpSSH Port      : 1-65535
Dropbear Port    : 443, 109
Dropbear WS Port : 443, 109
SSH WS Port      : 80
SSH SSL WS Port  : 443
SSL/TLS Port     : 443
OVPN WS SSL Port : 443
OVPN SSL Port    : 443
OVPN TCP Port    : 443, 1194
OVPN UDP Port    : 2200
BadVPN UDP       : 7100, 7300, 7300
---------------------
WSS Payload: GET wss://BUG.COM/ HTTP/1.1[crlf]Host: $domain[crlf]Upgrade: websocket[crlf][crlf] 
---------------------
OpenVPN Link     : http://$domain:85
---------------------
Expiration       : $exp
END

      echo "{
        \"status\": \"success\",
        \"message\": \"SSH account successfully created\",
        \"data\": {
            \"username\": \"$username\",
            \"password\": \"$password\",            
            \"expired\": \"$exp\",
            \"ip_limit\": \"$ip_limit\",
            \"domain\": \"$domain\",
            \"ns_domain\": \"$ns_domain\",
            \"city\": \"$city\",
            \"pubkey\": \"$public_key\"
        }
    }"
    }

    # Main execution
    validate_input_110
    # Create account based on type
    case "$account_type" in
    vmess)
      if ! [[ "$2" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        echo '{"status": "error", "message": "Parameter $1 harus minimal 3 huruf, tidak boleh spasi dan karakter khusus"}'
        exit 1
      fi
      if ! [[ "$3" =~ ^[0-9]+$ && "$4" =~ ^[0-9]+$ && "$5" =~ ^[0-9]+$ ]]; then
        echo '{"status": "error", "message": "Parameter $3, $4, dan $5 harus angka"}'
        exit 1
      fi
      create_vmess_117 "$1" "$2" "$3" "$4" "$5"
      ;;
    vless)
      if ! [[ "$2" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        echo '{"status": "error", "message": "Parameter $1 harus minimal 3 huruf, tidak boleh spasi dan karakter khusus"}'
        exit 1
      fi
      if ! [[ "$3" =~ ^[0-9]+$ && "$4" =~ ^[0-9]+$ && "$5" =~ ^[0-9]+$ ]]; then
        echo '{"status": "error", "message": "Parameter $3, $4, dan $5 harus angka"}'
        exit 1
      fi
      create_vless_121 "$1" "$2" "$3" "$4" "$5"
      ;;
    trojan)
      if ! [[ "$2" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        echo '{"status": "error", "message": "Parameter $1 harus minimal 3 huruf, tidak boleh spasi dan karakter khusus"}'
        exit 1
      fi
      if ! [[ "$3" =~ ^[0-9]+$ && "$4" =~ ^[0-9]+$ && "$5" =~ ^[0-9]+$ ]]; then
        echo '{"status": "error", "message": "Parameter $3, $4, dan $5 harus angka"}'
        exit 1
      fi
      create_trojan_125 "$1" "$2" "$3" "$4" "$5"
      ;;
    shadowsocks)
      if ! [[ "$2" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        echo '{"status": "error", "message": "Parameter $1 harus minimal 3 huruf, tidak boleh spasi dan karakter khusus"}'
        exit 1
      fi
      if ! [[ "$3" =~ ^[0-9]+$ && "$4" =~ ^[0-9]+$ && "$5" =~ ^[0-9]+$ ]]; then
        echo '{"status": "error", "message": "Parameter $3, $4, dan $5 harus angka"}'
        exit 1
      fi
      create_shadowsocks_128 "$1" "$2" "$3" "$4" "$5"
      ;;
    ssh)
      if ! [[ "$2" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        echo '{"status": "error", "message": "Parameter $1 harus minimal 3 huruf, tidak boleh spasi dan karakter khusus"}'
        exit 1
      fi
      if ! [[ "$3" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        echo '{"status": "error", "message": "Parameter $1 harus minimal 3 huruf, tidak boleh spasi dan karakter khusus"}'
        exit 1
      fi
      if ! [[ "$5" =~ ^[0-9]+$ ]]; then
        echo '{"status": "error", "message": "Parameter $5 harus angka"}'
        exit 1
      fi
      create_ssh_134 "$1" "$2" "$3" "$4" "$5"
      ;;
    *)
      echo '{"status": "error", "message": "Invalid account type"}'
      exit 1
      ;;
    esac

    # Restart service
    if [ "$account_type" = "ssh" ]; then
      if ! systemctl restart ssh; then
        echo "Failed to restart SSH service"
      fi
    else
      if ! systemctl restart "$account_type@config"; then
        echo "Failed to restart xray $account_type service"
      fi
    fi
  else
    echo '{
        "status": "error",
        "message": "PERMISSION DENIED!",
        "detail": "Your VPS $(wget -qO- ipv4.icanhazip.com) Has been Banned",
        "suggestion": "Buy access permissions for scripts",
        "contact": {
            "WhatsApp": "wa.me/6281584099035",
            "Telegram": "t.me/storezid2"
        }
    }'
    exit
  fi
else
  echo '{
        "status": "error",
        "message": "PERMISSION DENIED!",
        "detail": "Your VPS $(wget -qO- ipv4.icanhazip.com) Has been Banned",
        "suggestion": "Buy access permissions for scripts",
        "contact": {
            "WhatsApp": "wa.me/6281584099035",
            "Telegram": "t.me/storezid2"
        }
    }'
  exit
fi

