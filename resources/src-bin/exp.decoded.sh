#!/bin/bash

##----- Auto Remove Function
auto_remove() {
    local service=$1
    local db_path=$2
    local config_path=$3
    local log_path=$4
    local user_files=("${@:5}")

    data=($(grep '^###' "$db_path" | cut -d ' ' -f 2 | sort | uniq))
    now=$(date +"%Y-%m-%d")
    for user in "${data[@]}"; do
        exp=$(grep -w "^### $user" "$db_path" | cut -d ' ' -f 3 | sort | uniq)
        d1=$(date -d "$exp" +%s)
        d2=$(date -d "$now" +%s)
        exp2=$(((d1 - d2) / 86400))
        if [[ "$exp2" -le "0" ]]; then
            sed -i "/^### $user $exp/,/^},{/d" "$config_path"
            sed -i "/^### $user $exp/d" "$db_path"
            if [ -f "$log_path/log-create-${user}.log" ]; then
                rm -f "$log_path/log-create-${user}.log"
                for file in "${user_files[@]}"; do
                    rm -f "$log_path/${user}-${file}.json"
                done
            fi

            if ! systemctl restart "${service}@config" >/dev/null 2>&1; then
                echo "Warning: Failed to restart $service service. Please check system logs for more information."
                echo "However, the account has been successfully removed from the database."
            fi
        fi
    done
}

##----- Auto Remove Vmess
auto_remove "vmess" "/etc/xray/vmess/.vmess.db" "/etc/xray/vmess/config.json" "/etc/xray/vmess" "non" "tls" "grpc"

##----- Auto Remove Vless
auto_remove "vless" "/etc/xray/vless/.vless.db" "/etc/xray/vless/config.json" "/etc/xray/vless" "non" "tls" "grpc"

##----- Auto Remove Trojan
auto_remove "trojan" "/etc/xray/trojan/.trojan.db" "/etc/xray/trojan/config.json" "/etc/xray/trojan" "non" "tls" "grpc"

##----- Auto Remove Shadowsocks
auto_remove "shadowsocks" "/etc/xray/shadowsocks/.shadowsocks.db" "/etc/xray/shadowsocks/config.json" "/etc/xray/shadowsocks" "non" "tls" "grpc"

##----- Auto Remove SSH
data=($(grep '^###' /etc/ssh/.ssh.db | cut -d ' ' -f 2 | sort | uniq))
now=$(date +"%Y-%m-%d")
for user in "${data[@]}"; do
    exp=$(grep -w "^### $user" "/etc/ssh/.ssh.db" | cut -d ' ' -f 3 | sort | uniq)
    d1=$(date -d "$exp" +%s)
    d2=$(date -d "$now" +%s)
    exp2=$(((d1 - d2) / 86400))
    if [[ "$exp2" -le "0" ]]; then
        rm -f /etc/xray/log-createssh-$user.log
        sed -i "/^### $user/d" /etc/ssh/.ssh.db
        userdel -f $user 2>/dev/null
    fi
done
systemctl restart sshd
