#!/bin/bash

# Colors
green="\e[38;5;82m"
red="\e[38;5;196m"
neutral="\e[0m"
orange="\e[38;5;130m"
blue="\e[38;5;39m"
yellow="\e[38;5;226m"
purple="\e[38;5;141m"
bold_white="\e[1;37m"
reset="\e[0m"
pink="\e[38;5;205m"
print_rainbow() {
    local text="$1"
    local length=${#text}
    local start_color=(0 5 0)
    local mid_color=(0 200 0)
    local end_color=(0 5 0)

    for ((i = 0; i < length; i++)); do
        local progress=$(echo "scale=2; $i / ($length - 1)" | bc)

        if (($(echo "$progress < 0.5" | bc -l))); then
            local factor=$(echo "scale=2; $progress * 2" | bc)
            r=$(echo "scale=0; (${start_color[0]} * (1-$factor) + ${mid_color[0]} * $factor)/1" | bc)
            g=$(echo "scale=0; (${start_color[1]} * (1-$factor) + ${mid_color[1]} * $factor)/1" | bc)
            b=$(echo "scale=0; (${start_color[2]} * (1-$factor) + ${mid_color[2]} * $factor)/1" | bc)
        else
            local factor=$(echo "scale=2; ($progress - 0.5) * 2" | bc)
            r=$(echo "scale=0; (${mid_color[0]} * (1-$factor) + ${end_color[0]} * $factor)/1" | bc)
            g=$(echo "scale=0; (${mid_color[1]} * (1-$factor) + ${end_color[1]} * $factor)/1" | bc)
            b=$(echo "scale=0; (${mid_color[2]} * (1-$factor) + ${end_color[2]} * $factor)/1" | bc)
        fi

        printf "\e[38;2;%d;%d;%dm%s" "$r" "$g" "$b" "${text:$i:1}"
    done
    echo -e "$reset"
}
cek_status() {
    status=$(systemctl is-active --quiet $1 && echo "aktif" || echo "nonaktif")
    if [ "$status" = "aktif" ]; then
        echo -e "${green}GOOD${neutral}"
    else
        echo -e "${red}BAD${neutral}"
    fi
}

setup_bot() {
    # Membuat direktori .bot jika belum ada /root/bot"
    if [ ! -d "/root/.bot" ]; then
        mkdir -p /root/.bot
    fi

    # Memeriksa dan menginstal dependensi npm jika belum terinstal
    if ! npm list --prefix /root/.bot express telegraf axios moment sqlite3 >/dev/null 2>&1; then
        npm install --prefix /root/.bot express telegraf axios moment sqlite3
    fi

    # Mengunduh bot.zip jika app.js belum ada
    if [ ! -f /root/.bot/app.js ]; then
        wget -q -O /root/.bot/bot.zip https://raw.githubusercontent.com/zidnyzd/Autoscript/main/bot.zip
        unzip -o /root/.bot/bot.zip -d /root/.bot >/dev/null 2>&1
        rm /root/.bot/bot.zip >/dev/null 2>&1
    fi

    # Memberikan izin eksekusi pada semua file di dalam direktori .bot
    if [ -n "$(ls -A /root/.bot)" ]; then
        chmod +x /root/.bot/*
    fi
}
client_api() {
cat >/usr/bin/api <<EOF
#!/bin/bash
node /root/.bot/api.js
EOF
chmod +x /usr/bin/api
cat >/etc/systemd/system/api.service <<EOF
[Unit]
Description=API Service
Documentation=ZIDSTORE
After=syslog.target network-online.target

[Service]
User=root
NoNewPrivileges=true
ExecStart=/usr/bin/api

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload >/dev/null 2>&1
    systemctl enable api.service >/dev/null 2>&1
    systemctl start api.service >/dev/null 2>&1
    systemctl restart api.service >/dev/null 2>&1
    clear
    echo -e "${orange}─────────────────────────────────────────${neutral}"
    echo -e "   ${green}.:::. BOT SIMPLE TELEGRAM .:::.   ${neutral}"
    echo -e "${orange}─────────────────────────────────────────${neutral}"
    echo -e "       ${green}•${neutral} api create user"
    echo -e "       ${green}•${neutral} api delete user"
    echo -e "       ${green}•${neutral} api renew user"
    echo -e "       ${green}•${neutral} api check user"
    echo -e "       Status Api is "$(cek_status api.service)""
    echo -e "${orange}─────────────────────────────────────────${neutral}"
}


server_app() {
    clear
    echo -e "${orange}─────────────────────────────────────────${neutral}"
    echo -e "   ${green}.:::. BOT SIMPLE TELEGRAM .:::.   ${neutral}"
    echo -e "${orange}─────────────────────────────────────────${neutral}"
    echo -e "       ${green}•${neutral} server create user"
    echo -e "       ${green}•${neutral} server delete user"
    echo -e "       ${green}•${neutral} server renew user"
    echo -e "       ${green}•${neutral} server check user"
    echo -e "${orange}─────────────────────────────────────────${neutral}"
    read -p "Masukkan token bot: " token
    if [ -z "$token" ]; then
        echo -e "${red}Token bot cannot be empty. Please try again.${neutral}"
        exit 1
    fi

    read -p "Masukkan admin ID: " adminid
    if [ -z "$adminid" ]; then
        echo -e "${red}Admin ID cannot be empty. Please try again.${neutral}"
        exit 1
    fi
    rm -f /root/.bot/.vars.json
    echo "{
  \"BOT_TOKEN\": \"$token\",
  \"ADMIN\": [$adminid]
}" > /root/.bot/.vars.json
cat >/etc/systemd/system/app.service <<EOF
[Unit]
Description=App Bot Service
After=network.target

[Service]
ExecStart=/usr/bin/node /root/.bot/app.js
Restart=always
User=root
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
WorkingDirectory=/usr/bin

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload >/dev/null 2>&1
    systemctl enable app.service >/dev/null 2>&1
    systemctl start app.service >/dev/null 2>&1
    systemctl restart app.service >/dev/null 2>&1
    printf "\033[2A\033[0J"
    echo -e "       Status Server is "$(cek_status app.service)""
    echo -e "${orange}─────────────────────────────────────────${neutral}"
    echo -e "${green}Bot has been installed and running.${neutral}"
    echo -e "${green}Type ${bold_white}/start${neutral} or ${bold_white}menu${neutral} in the telegram bot${neutral}"
}

if [[ ${1} == "client" ]]; then
    setup_bot
    client_api
elif [[ ${1} == "server" ]]; then
    setup_bot
    server_app
else
    echo -e "${red}Invalid command. Use: ${yellow}bot server${neutral} or ${yellow}bot client${neutral}"
    exit 1
fi


