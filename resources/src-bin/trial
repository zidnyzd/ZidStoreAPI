#!/bin/bash

user="$2"
timer="$3"
vmess_config="/etc/xray/vmess/config.json"
vless_config="/etc/xray/vless/config.json"
trojan_config="/etc/xray/trojan/config.json"
shadowsocks_config="/etc/xray/shadowsocks/config.json"


function trial_vmess() {
    while true; do
        sleep ${timer}m
        exp=$(grep -wE "^### $user" "$vmess_config" | cut -d ' ' -f 3 | sort | uniq)
        sed -i "/^### $user $exp/,/^},{/d" "$vmess_config"
        systemctl restart vmess@config
        break
    done
}

function trial_vless() {
    while true; do
        sleep ${timer}m
        exp=$(grep -wE "^### $user" "$vless_config" | cut -d ' ' -f 3 | sort | uniq)
        sed -i "/^### $user $exp/,/^},{/d" "$vless_config"
        systemctl restart vless@config
        break
    done
}

function trial_trojan() {
    while true; do
        sleep ${timer}m
        exp=$(grep -wE "^### $user" "$trojan_config" | cut -d ' ' -f 3 | sort | uniq)
        sed -i "/^### $user $exp/,/^},{/d" "$trojan_config"
        systemctl restart trojan@config
        break
    done
}

function trial_shadowsocks() {
    while true; do
        sleep ${timer}m
        exp=$(grep -wE "^### $user" "$shadowsocks_config" | cut -d ' ' -f 3 | sort | uniq)
        sed -i "/^### $user $exp/,/^},{/d" "$shadowsocks_config"
        systemctl restart shadowsocks@config
        break
    done
}

function trial_ssh() {
    while true; do
        sleep ${timer}m
        getent passwd $user >/dev/null
        if [ $? -eq 0 ]; then
            userdel -f $user >/dev/null 2>&1
            systemctl restart sshd >/dev/null 2>&1
        fi
        break
    done
}

if [[ ${1} == "trialws" ]]; then
    trial_vmess
elif [[ ${1} == "trialvl" ]]; then
    trial_vless
elif [[ ${1} == "trialtr" ]]; then
    trial_trojan
elif [[ ${1} == "trialss" ]]; then
    trial_shadowsocks
elif [[ ${1} == "trialssh" ]]; then
    trial_ssh
else
    echo "Invalid command. Use: trialws, trialvl, trialtr, trialss, or trialssh"
    exit 1
fi
