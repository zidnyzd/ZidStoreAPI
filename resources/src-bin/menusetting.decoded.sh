#!/bin/bash

# Fetch URL from the first argument
data_acc="https://zds.web.id/api/exp?key="
data_key=$(cat /root/.key)

status_code=$(curl -s -o /dev/null -w "%{http_code}" $data_acc$data_key)

if [ $status_code -eq 200 ]; then
    expiry_date=$(date -d "$(curl -s $data_acc$data_key)" +%s)
    current_date=$(date +%s)
    remaining_days=$(( (expiry_date - current_date) / 86400 ))

    if [ $expiry_date -gt $current_date ]; then
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

# Function to print rainbow text
        print_rainbow() {
            local text="$1"
            local length=${#text}
            local start_color=(0 5 0)
            local mid_color=(0 200 0)
            local end_color=(0 5 0)

            for ((i = 0; i < length; i++)); do
                local progress=$((i * 100 / (length - 1)))

                if [ $progress -lt 50 ]; then
                    local factor=$((progress * 2))
                    r=$(( (start_color[0] * (100 - factor) + mid_color[0] * factor) / 100 ))
                    g=$(( (start_color[1] * (100 - factor) + mid_color[1] * factor) / 100 ))
                    b=$(( (start_color[2] * (100 - factor) + mid_color[2] * factor) / 100 ))
                else
                    local factor=$(((progress - 50) * 2))
                    r=$(( (mid_color[0] * (100 - factor) + end_color[0] * factor) / 100 ))
                    g=$(( (mid_color[1] * (100 - factor) + end_color[1] * factor) / 100 ))
                    b=$(( (mid_color[2] * (100 - factor) + end_color[2] * factor) / 100 ))
                fi

                printf "\e[38;2;%d;%d;%dm%s" "$r" "$g" "$b" "${text:$i:1}"
            done
            echo -e "$reset" # Reset color at the end
        }
        # Function to display a loading bar
        fun_bar() {
            CMD[0]="$1"
            CMD[1]="$2"
            (
                [[ -e $HOME/fim ]] && rm $HOME/fim
                ${CMD[0]} -y >/dev/null 2>&1
                ${CMD[1]} -y >/dev/null 2>&1
                touch $HOME/fim
            ) >/dev/null 2>&1 &
            tput civis
            echo -ne "  ${orange}Please wait while loading ${neutral}- ${orange}["
            while true; do
                for ((i = 0; i < 18; i++)); do
                    echo -ne "${green}#"
                    sleep 0.1s
                done
                [[ -e $HOME/fim ]] && rm $HOME/fim && break
                echo -e "${orange}]"
                sleep 1s
                tput cuu1
                tput dl1
                echo -ne "  ${orange}Please wait while loading ${neutral}- ${orange}["
            done
            echo -e "${orange}]${neutral} -${green} OK !${neutral}"
            tput cnorm
        }

        # Function to restart services
        restart_services() {
            services=(
                "ssh" "dropbear" "ws" "openvpn" "nginx" "haproxy"
                "xray@vmess" "xray@vless" "xray@trojan" "xray@shadowsocks"
            )
            
            for service in "${services[@]}"; do
                echo -e "\033[0;33mRestarting service: \033[0;32m$service\033[0m"
                fun_bar "systemctl restart $service"
            done
            clear
            
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo -e "   ${green} .:::. RESTART SERVER SERVICES .:::.${neutral}"
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo -e ""    
        }

        # Function to check bandwidth
        check_bw() {
            clear
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo -e " ${green} .:::. VNSTAT BANDWIDTH STATISTICS .:::.${neutral}"
            echo -e "${orange}─────────────────────────────────────────${neutral}"

            # Check if vnstat is installed
            if ! command -v vnstat &>/dev/null; then
                echo -e "${red}Error: vnstat is not installed.${neutral}"
                echo -e "Please install vnstat first."
                read -n 1 -s -r -p "Press any key to return to the main menu"
                return
            fi

            # Check if there are any network interfaces available
            if [ -z "$(vnstat --iflist)" ]; then
                echo -e "${red}Error: No network interfaces available for vnstat.${neutral}"
                read -n 1 -s -r -p "Press any key to return to the main menu"
                return
            fi

            vnstat
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo -e "     ${green}1.${neutral} Show bandwidth details"
            echo -e "     ${green}2.${neutral} Return to main menu"
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            print_rainbow "───────────────────────────────────────"

            echo -e ""
            read -p " Select an option (1-2): " choice

            case $choice in
            1)
                echo -e "\nSelect period:"
                echo -e "     ${green}1.${neutral} Today"
                echo -e "     ${green}2.${neutral} Yesterday"
                echo -e "     ${green}3.${neutral} This month"
                echo -e "     ${green}4.${neutral} This year"
                read -p " Select period (1-4): " period

                case $period in
                1) vnstat -d ;;
                2) vnstat -d 1 ;;
                3) vnstat -m ;;
                4) vnstat -y ;;
                *) echo -e "   ${red}Invalid choice${neutral}" ;;
                esac
                ;;
            2) return ;;
            *) echo -e "   ${red}Invalid choice${neutral}" ;;
            esac

            read -n 1 -s -r -p "Press any key to continue"
            check_bw
        }

        # Function to display port information
        info_port() {
            clear
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo -e "${green}    .:::. PORT INFORMATION .:::.${neutral}"
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo -e "  ${green}• SSH                : ${neutral}22, 443, 80"
            echo -e "  ${green}• Dropbear           : ${neutral}443, 109, 143"
            echo -e "  ${green}• SSH Websocket      : ${neutral}80, 443"
            echo -e "  ${green}• OpenVPN            : ${neutral}443, 1194, 2200"
            echo -e "  ${green}• Nginx              : ${neutral}80, 81, 443"
            echo -e "  ${green}• Haproxy            : ${neutral}80, 443"
            echo -e "  ${green}• DNS                : ${neutral}53, 443"
            echo -e "  ${green}• XRAY Vmess         : ${neutral}80, 443"
            echo -e "  ${green}• XRAY Vless         : ${neutral}80, 443"
            echo -e "  ${green}• Trojan             : ${neutral}443"
            echo -e "  ${green}• Shadowsocks        : ${neutral}443"
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo -e "  ${yellow}• Time Zone          : ${neutral}Asia/Jakarta (GMT +7)"
            if [[ -f /etc/cron.d/daily_reboot ]]; then
                reboot_time=$(grep -oP '^\d+\s+\d+' /etc/cron.d/daily_reboot | head -1 | awk '{printf "%02d:%02d", $2, $1}')
                echo -e "  ${yellow}• Automatic Restart  : ${neutral}${reboot_time} GMT +7"
            else
                echo -e "  ${yellow}• Automatic Restart  : ${neutral}Not Set"
            fi
            echo -e "  ${yellow}• Auto Delete Expired: ${neutral}Yes"
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo -e ""
            read -n 1 -s -r -p "Press any key to return to the menu"
        }
        # Function to change VPS domain
        change_domain() {
            clear
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo -e "${green}      .:::. CHANGE VPS DOMAIN .:::.      ${neutral}"
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo -e ""
            read -p "  Enter New Domain: " new_domain

            if [ -z "$new_domain" ]; then
                echo -e "  ${red}Error: Domain cannot be empty${neutral}"
                read -n 1 -s -r -p "Press any key to return"
                return 1
            fi

            current_domain=$(cat /etc/xray/domain)
            if [ "$new_domain" = "$current_domain" ]; then
                echo -e "\n  ${yellow}The entered domain is the same as the current domain.${neutral}"
                read -p "  Do you want to renew the certificate? (y/n): " renew_cert
                if [[ $renew_cert =~ ^[Yy]$ ]]; then
                    echo -e "\n  ${green}Processing certificate renewal...${neutral}"
                else
                    echo -e "\n  ${green}No changes were made.${neutral}"
                    read -n 1 -s -r -p "Press any key to return to the menu"
                    return 0
                fi
            else
                echo -e "\n  ${green}Processing domain change...${neutral}"
                echo -e ""
            fi

            # Function to display loading animation
            show_loading() {
                local pid=$1
                local message=$2
                local delay=0.1
                local spinstr='|/-\'
                while [ "$(ps a | awk '{print $1}' | grep $pid)" ]; do
                    local temp=${spinstr#?}
                    printf " %s [%c]  " "$message" "$spinstr"
                    local spinstr=$temp${spinstr%"$temp"}
                    sleep $delay
                    printf "\r"
                done
                printf "    \n"
            }

            {
                systemctl stop nginx >/dev/null 2>&1
                systemctl stop haproxy >/dev/null 2>&1
                # Check if domain resolves to server IP
                server_ip=$(curl -s ipv4.icanhazip.com)
                domain_ip=$(getent ahosts $new_domain | awk '{print $1}' | head -n 1)

                if [ "$server_ip" != "$domain_ip" ]; then
                    echo -e ""
                    systemctl start nginx >/dev/null 2>&1
                    systemctl start haproxy >/dev/null 2>&1
                    return 1
                fi

                if [ $? -ne 0 ]; then
                    systemctl start nginx >/dev/null 2>&1
                    systemctl start haproxy >/dev/null 2>&1
                    return 1
                fi
                if [ -f /etc/xray/domain ]; then
                    rm -rf /etc/xray/domain >/dev/null 2>&1
                fi
                echo $new_domain > /etc/xray/domain
                if [ $? -ne 0 ]; then
                    echo -e "\n${red}Failed to write new domain ${neutral}"
                    systemctl start nginx >/dev/null 2>&1
                    systemctl start haproxy >/dev/null 2>&1
                    return 1
                fi
                /root/.acme.sh/acme.sh --upgrade --auto-upgrade >/dev/null 2>&1
                /root/.acme.sh/acme.sh --set-default-ca --server letsencrypt >/dev/null 2>&1
                /root/.acme.sh/acme.sh --issue -d $new_domain --standalone -k ec-256 >/dev/null 2>&1
                /root/.acme.sh/acme.sh --installcert -d $new_domain --fullchainpath /etc/xray/xray.crt --keypath /etc/xray/xray.key --ecc >/dev/null 2>&1
                cat /etc/xray/xray.crt /etc/xray/xray.key | tee /etc/haproxy/yha.pem >/dev/null 2>&1
                chown www-data:www-data /etc/xray/xray.key >/dev/null 2>&1
                chown www-data:www-data /etc/xray/xray.crt >/dev/null 2>&1
                systemctl restart haproxy >/dev/null 2>&1
                systemctl restart nginx >/dev/null 2>&1
            } &

            show_loading $! "  Processing domain change"
            # Check previous process status
            wait $!
            process_status=$?

            if [ $process_status -eq 0 ]; then
                if [ "$new_domain" = "$current_domain" ]; then
                    echo -e "\n  ${green}Success: Certificate renewed - $new_domain${neutral}"
                else
                    echo -e "\n  ${green}Success: Domain changed to $new_domain${neutral}"
                fi
                echo -e "  ${yellow}Restart VPS to apply changes${neutral}"
            else
                echo -e "\n${red}Failed to change domain/renew certificate${neutral}"
            fi
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            read -n 1 -s -r -p "Press any key to return to the menu"
        }

        change_ns() {
            clear
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo -e "${green}        .:::. CHANGE VPS NS .:::.         ${neutral}"
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo -e ""
            read -p "  Enter New NS: " new_ns

            if [ -z "$new_ns" ]; then
                echo -e "${red}Error: NS cannot be empty.${neutral}"
                echo -e "${orange}─────────────────────────────────────────${neutral}"
                read -n 1 -s -r -p "Press any key to return to the menu"
                return
            fi
            ns=$(cat /etc/xray/dns)
            echo $new_ns >/etc/xray/dns

            if [ -f /etc/systemd/system/dnstt-client.service ]; then
                sed -i "s/$ns/$new_ns/g" /etc/systemd/system/dnstt-client.service
            else
                echo -e "${red}Error: client.service not found.${neutral}"
            fi

            if [ -f /etc/systemd/system/dnstt-server.service ]; then
                sed -i "s/$ns/$new_ns/g" /etc/systemd/system/dnstt-server.service
            else
                echo -e "${red}Error: server.service not found.${neutral}"
            fi

            systemctl daemon-reload

            if systemctl restart dnstt-server; then
                echo -e "${green}dnstt-server.service restarted successfully.${neutral}"
            else
                echo -e "${red}Failed to restart dnstt-server.service.${neutral}"
            fi

            if systemctl restart dnstt-client; then
                echo -e "${green}dnstt-client.service restarted successfully.${neutral}"
            else
                echo -e "${red}Failed to restart dnstt-client.service.${neutral}"
            fi
            echo -e "${green}Success: NS changed to $new_ns${neutral}"
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            read -n 1 -s -r -p "Press any key to return to the menu"
        }

        running() {
            # Function to check service status
            check_status() {
                status=$(systemctl is-active --quiet $1 && echo "active" || echo "inactive")
                if [ "$status" = "active" ]; then
                    echo -e "${green}GOOD${neutral}"
                else
                    echo -e "${red}BAD${neutral}"
                fi
            }

            # Check service status
            services=(
                "ssh" "dropbear" "ws" "openvpn" "nginx" "haproxy"
            )

            for s in "${services[@]}"; do
                declare "$s"="$(check_status $s)"
            done

            # Function to print information
            print_info() {
                printf "   ${yellow}%-19s${neutral} : %-25s\n" "$1" "$2"
            }

            # Print service information
            clear
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo -e "${green}       .:::. SYSTEM INFORMATION .:::.        ${neutral}"
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            service_info=(
                "OpenSSH" "${ssh}"
                "Dropbear" "${dropbear}"
                "SSH Websocket" "${ws}"
                "OpenVPN" "${openvpn}"
                "Nginx" "${nginx}"
                "Haproxy" "${haproxy}"
                "Xray vmess" "$(check_status vmess@config)"
                "Xray vless" "$(check_status vless@config)"
                "Xray trojan" "$(check_status trojan@config)"
                "Xray SSocks" "$(check_status shadowsocks@config)"
            )

            for ((i = 0; i < ${#service_info[@]}; i += 2)); do
                print_info "${service_info[i]}" "${service_info[i + 1]}"
            done

            echo -e "${orange}─────────────────────────────────────────${neutral}"
            print_rainbow "─────────────────────────────────────────"
            echo ""
        }

        auto_backup() {
            local status=$(grep -qE "^SHELL" /etc/cron.d/backup && echo -e "\033[32m[ON]\033[0m" || echo -e "\033[31m[OFF]\033[0m")
            clear
            echo -e "${orange}┌──────────────────────────────────────┐${neutral}"
            echo -e "${orange}│${green}         AUTO BACKUP SETTINGS         ${orange}│${neutral}"
            echo -e "${orange}└──────────────────────────────────────┘${neutral}"
            echo -e "${orange}┌──────────────────────────────────────┐${neutral}"
            echo -e "${orange}│${neutral} AutoBackup Status: $status"
            echo -e "${orange}│${neutral} 1) Every 6 Hours"
            echo -e "${orange}│${neutral} 2) Every 1 Day"
            echo -e "${orange}│${neutral} 3) Every 1 Week"
            echo -e "${orange}│${neutral} 4) Every 1 Month"
            echo -e "${orange}│${neutral} 5) Disable AutoBackup"
            echo -e "${orange}│${neutral} x) Exit"
            echo -e "${orange}└──────────────────────────────────────┘${neutral}"
            
            read -p "Choose an option [1-5 or x]: " pilihan
            case $pilihan in
                1) echo -e "SHELL=/bin/sh\nPATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n0 */6 * * * root /usr/bin/backuprestore backup" > /etc/cron.d/backup
                clear
                print_rainbow "────────────────────────────────────────"
                echo -e "${orange}│${neutral}"
                echo -e "${orange}│${neutral}      AutoBackup: Every 6 Hours"
                echo -e "${orange}│${neutral}"
                print_rainbow "────────────────────────────────────────"
                service cron restart > /dev/null 2>&1
                ;;
                2) echo -e "SHELL=/bin/sh\nPATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n0 0 * * * root /usr/bin/backuprestore backup" > /etc/cron.d/backup
                clear
                print_rainbow "────────────────────────────────────────"
                echo -e "${orange}│${neutral}"
                echo -e "${orange}│${neutral}      AutoBackup: Every 1 Day"
                echo -e "${orange}│${neutral}"
                print_rainbow "────────────────────────────────────────"
                service cron restart > /dev/null 2>&1
                ;;
                3) echo -e "SHELL=/bin/sh\nPATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n0 0 * * 7 root /usr/bin/backuprestore backup" > /etc/cron.d/backup
                clear
                print_rainbow "────────────────────────────────────────"
                echo -e "${orange}│${neutral}"
                echo -e "${orange}│${neutral}      AutoBackup: Every 1 Week"
                echo -e "${orange}│${neutral}"
                print_rainbow "────────────────────────────────────────"
                service cron restart > /dev/null 2>&1
                ;;
                4) echo -e "SHELL=/bin/sh\nPATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n0 0 1 * * root /usr/bin/backuprestore backup" > /etc/cron.d/backup
                clear
                print_rainbow "────────────────────────────────────────"
                echo -e "${orange}│${neutral}"
                echo -e "${orange}│${neutral}      AutoBackup: Every 1 Month"
                echo -e "${orange}│${neutral}"
                print_rainbow "────────────────────────────────────────"
                service cron restart > /dev/null 2>&1
                ;;
                5) 
                    if [ ! -f /etc/cron.d/backup ]; then
                        clear
                        print_rainbow "────────────────────────────────────────"
                        echo -e "${orange}│${neutral}"
                        echo -e "${orange}│${neutral} AutoBackup Already ${red}Disabled${neutral}"
                        echo -e "${orange}│${neutral}"
                        print_rainbow "────────────────────────────────────────"
                        return
                    fi
                    rm -f /etc/cron.d/backup 
                    clear
                    print_rainbow "────────────────────────────────────────"
                    echo -e "${orange}│${neutral}"
                    echo -e "${orange}│${neutral}      AutoBackup ${red}Disabled${neutral}"
                    echo -e "${orange}│${neutral}"
                    print_rainbow "────────────────────────────────────────"
                    service cron restart > /dev/null 2>&1
                    return
                    ;;
                x|X) clear; return ;;
                *) echo "Invalid choice. Please try again."; return ;;
            esac
        }

setup_bot_telegram() {
    clear
    echo -e "${orange}─────────────────────────────────────────${neutral}"
    echo -e "${green}     .:::. SETUP BOT TELEGRAM .:::.        ${neutral}"
    echo -e "${orange}─────────────────────────────────────────${neutral}"
    echo -e ""
    read -p "Masukkan token bot telegram Anda: " bot_token
    read -p "Masukkan chat ID Anda: " chat_id
    
    # Pengecualian jika token bot atau chat ID kosong
    if [[ -z "$bot_token" || -z "$chat_id" ]]; then
        echo -e "${red}Token bot atau chat ID tidak boleh kosong.${neutral}"
        return
    fi
    # Menghapus terlebih dahulu jika sudah ada
    if [ -f /root/.vars ]; then
        rm -f /root/.vars
    fi
    echo "bot_token=\"$bot_token\"" >> /root/.vars
    echo "telegram_id=\"$chat_id\"" >> /root/.vars
    systemctl restart limitip > /dev/null 2>&1
    print_rainbow "─────────────────────────────────────────"
    echo -e "${green}Token bot dan chat ID telah disimpan di /root/.vars${neutral}"
    read -n 1 -s -r -p "Press any key to return to the menu"

}
        setting_reboot_jam_reboot() {
            clear
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo -e "${green}     .:::. SETTING AUTO REBOOT .:::.        ${neutral}"
            echo -e "${orange}─────────────────────────────────────────${neutral}"
            echo -e ""
            read -p "Enter Autoreboot (24-hour, ex: 02 for 2 AM): " reboot_hour
            
            # Exception if the input hour is empty or invalid
            if [[ -z "$reboot_hour" || ! "$reboot_hour" =~ ^[0-9]{2}$ || "$reboot_hour" -lt 0 || "$reboot_hour" -gt 23 ]]; then
                echo -e "${red}Invalid hour input. Please enter an hour between 00 and 23.${neutral}"
                return
            fi
            
            # Menambahkan cron job untuk auto reboot
            echo -e "SHELL=/bin/sh\nPATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n0 $reboot_hour * * * root /sbin/reboot" > /etc/cron.d/daily_reboot
            systemctl restart cron
            clear
            print_rainbow "────────────────────────────────────────"
            echo -e "${orange}│${neutral}"
            echo -e "${orange}│${neutral}      AutoReboot Every: Hour $reboot_hour"
            echo -e "${orange}│${neutral}"
            print_rainbow "────────────────────────────────────────"
            read -n 1 -s -r -p "Press any key to return to the menu"
        }

        clear
        echo -e "${orange}─────────────────────────────────────────${neutral}"
        echo -e "${green}     .:::. SYSTEM SETTINGS .:::.        ${neutral}"
        echo -e "${orange}─────────────────────────────────────────${neutral}"
        echo -e "    ${green}1.${neutral} Setup bot telegram"
        echo -e "    ${green}2.${neutral} Check running system"
        echo -e "    ${green}3.${neutral} Check bandwidth usage"
        echo -e "    ${green}4.${neutral} Auto backup server data"
        echo -e "    ${green}5.${neutral} Backup/Restore server data"
        echo -e "    ${green}6.${neutral} Port information"
        echo -e "    ${green}7.${neutral} Restart all services"
        echo -e "    ${green}8.${neutral} Change server domain"
        echo -e "    ${green}9.${neutral} Change nameserver"
        echo -e "    ${green}10.${neutral} Change server banner"
        echo -e "    ${green}11.${neutral} Load server system"
        echo -e "    ${green}12.${neutral} Setting Auto Reboot"
        echo -e "    ${green}13.${neutral} Restart/Reboot server"
        echo -e "    ${green}x.${neutral} Exit system settings"
        echo -e "${orange}─────────────────────────────────────────${neutral}"
        print_rainbow "─────────────────────────────────────────"
        echo -e "          ${orange}───${green}───${yellow}───${blue}───${purple}───${red}───${neutral}"
        echo -e ""
        read -p " Choose an option (1-13) or type 'x' to exit: " menu
        case $menu in
            1) setup_bot_telegram ;;
            2) running ;;
            3) check_bw ;;
            4) auto_backup ;;
            5) backuprestore server ;;
            6) info_port ;;
            7) restart_services ;;
            8) change_domain ;;
            9) change_ns ;;
            10) nano /etc/zidstore/banner; clear ;;
            11) gotop ;;
            12) setting_reboot_jam_reboot  ;;
            13) reboot ;;
            x | X)
                echo -e ""
                echo -e "   ${green}Thank you for using our service.${neutral}"
                exit 0
                ;;
            *)
                echo -e "   ${red}Invalid choice. Please try again.${neutral}"
                sleep 2
                ;;
        esac

        else
            echo -e "\e[38;5;130m────────────────────────────────────────────\033[0m"
            echo -e "\e[38;5;82m         ZIDSTORE AUTOSCRIPT          \033[0m"
            echo -e "\e[38;5;130m────────────────────────────────────────────\033[0m"
            echo -e ""
            echo -e "            \033[31mPERMISSION DENIED !\033[0m"
            echo -e "   \033[0;33mYour VPS\033[0m $(wget -qO- ipv4.icanhazip.com) \033[0;33mHas been Banned\033[0m"
            echo -e "     \033[0;33mBuy access permissions for scripts\033[0m"
            echo -e "             \033[0;33mContact Admin :\033[0m"
            echo -e "      \033[0;32mWhatsApp\033[0m wa.me/6281584099035"
            echo -e "         \033[0;96mTelegram\033[0m t.me/storezid2"
            echo -e "\e[38;5;130m────────────────────────────────────────────\033[0m"
            exit
        fi
        else
            echo -e "\e[38;5;130m────────────────────────────────────────────\033[0m"
            echo -e "\e[38;5;82m         ZIDSTORE AUTOSCRIPT          \033[0m"
            echo -e "\e[38;5;130m────────────────────────────────────────────\033[0m"
            echo -e ""
            echo -e "            \033[31mPERMISSION DENIED !\033[0m"
            echo -e "   \033[0;33mYour VPS\033[0m $(wget -qO- ipv4.icanhazip.com) \033[0;33mHas been Banned\033[0m"
            echo -e "     \033[0;33mBuy access permissions for scripts\033[0m"
            echo -e "             \033[0;33mContact Admin :\033[0m"
            echo -e "      \033[0;32mWhatsApp\033[0m wa.me/6281584099035"
            echo -e "         \033[0;96mTelegram\033[0m t.me/storezid2"
            echo -e "\e[38;5;130m────────────────────────────────────────────\033[0m"
            exit
        fi
