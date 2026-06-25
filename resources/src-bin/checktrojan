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

    
# color configuration
green="\e[38;5;82m"
red="\033[31m"
normal='\033[0m'
orange="\e[38;5;130m"
bright_green="\e[92;1m"

# function to convert bytes to a more readable format
convert_size() {
    local -i bytes=$1
    if [[ $bytes -lt 1024 ]]; then
        echo "${bytes}B"
    elif [[ $bytes -lt 1048576 ]]; then
        echo "$(((bytes + 1023) / 1024))KB"
    elif [[ $bytes -lt 1073741824 ]]; then
        echo "$(((bytes + 1048575) / 1048576))MB"
    else
        echo "$(((bytes + 1073741823) / 1073741824))GB"
    fi
}

# get data
my_ip=$(curl -s ipv4.icanhazip.com)
server_data=$(curl -s -I https://google.com | grep -i ^date | cut -d' ' -f2-)
current_date=$(date +"%Y-%m-%d" -d "$server_data")
current_time=$(date +%T)

# loading animation
check_trojan() {
    echo ""
    echo -ne "\e[33mChecking Trojan Account\e[0m"
    for i in {1..2}; do
        for j in ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏; do
            echo -ne "\r\e[33mChecking Trojan Account $j\e[0m"
            sleep 0.1
        done
    done
    echo -ne "\r\e[33mTrojan Account Check Successful!    \e[0m\n"
    sleep 1
    clear

    # display header

    echo -e "${orange}─────────────────────────────────────────${neutral}"
    echo -e "${green}  .:::. TROJAN USER LOGIN ACCOUNTS .:::.${neutral}"
    echo -e "${orange}─────────────────────────────────────────${neutral}"
    # read user database
    user_list=($(grep '^###' /etc/xray/trojan/.trojan.db | cut -d ' ' -f 2 | sort -u))
    >/tmp/rotation_trojan

    # process log for each user
    declare -A user_ips
    declare -A last_access_time
    declare -A log_count

    for user in "${user_list[@]}"; do
        log_file=$(tail -n 150 /var/log/xray/access.log | grep -w "email: ${user}" | grep -v "127.0.0.1")
        current_time_seconds=$(date +%s.%N)
        log_count[$user]=$(grep -w "email: ${user}" /var/log/xray/access.log | grep -v "127.0.0.1" | wc -l)

        while read -r line; do
            if [[ -n ${line} ]]; then
                ((log_count[$user]++))
                read -r _ access_time ip_address _ <<<"$line"

                if [[ $ip_address =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(:([0-9]+))?$ ]]; then
                    ip_address=${ip_address%%:*}
                    access_time_seconds=$(date -d "${access_time}" +%s.%N)
                    time_difference=$(echo "$current_time_seconds - $access_time_seconds" | bc)

                    if (($(echo "$time_difference < 10" | bc -l))); then
                        if [[ -n "${user_ips[$ip_address]}" && "${user_ips[$ip_address]}" != "$user" ]]; then
                            continue
                        fi
                        user_ips[$ip_address]=$user
                        last_access_time["${user}:${ip_address}"]=$access_time
                    fi
                fi
            fi
        done <<<"${log_file}"
    done

    # sort and save results to temporary file
    for user in "${user_list[@]}"; do
        for ip_address in "${!user_ips[@]}"; do
            if [[ "${user_ips[$ip_address]}" == "$user" ]]; then
                access_time="${last_access_time["${user}:${ip_address}"]}"
                echo "${user} ${ip_address} ${access_time}"
            fi
        done
    done | sort -k1,1 -k3,3r >/tmp/rotation_trojan

    # display results
    if [[ -s /tmp/rotation_trojan ]]; then
        previous_user=""
        while read -r line; do
            read -r user ip_address access_time <<<"$line"
            if [[ -e /etc/xray/trojan/${user} ]]; then
                current_time_seconds=$(date +%s.%N)
                access_time_seconds=$(date -d "${access_time}" +%s.%N)
                time_difference=$(echo "$current_time_seconds - $access_time_seconds" | bc)

                if (($(echo "$time_difference < 60" | bc -l))); then
                    if [[ "$user" != "$previous_user" ]]; then
                        if [[ -n "$previous_user" ]]; then
                            echo -e "${orange}└───────────────────────────────────────┘${normal}"
                            echo ""
                        fi
                        usage=$(</etc/xray/trojan/usage/${user})
                        readable_usage=$(convert_size ${usage})
                        limit=$(</etc/xray/trojan/${user})
                        readable_limit=$(convert_size ${limit})
                        connection_count=$(grep -cw "${user}" /tmp/rotation_trojan)
                        echo -e "${red} CONNECTION DETAILS:${normal}"
                        echo -e "${orange}┌───────────────────────────────────────┐${normal}"
                        echo -e "${orange}│${normal} USER: ${user}"
                        echo -e "${orange}│${normal} USAGE: ${readable_usage}"
                        echo -e "${orange}│${normal} QUOTA: ${readable_limit}"
                        ip_limit=$(cat /etc/xray/trojan/${user}IP)
                        if [[ "$ip_limit" -eq 0 ]]; then
                            echo -e "${orange}│${normal} IP LIMIT: Unlimited"
                        else
                            echo -e "${orange}│${normal} IP LIMIT: $ip_limit"
                        fi
                        echo -e "${orange}│${normal} IP COUNT: ${connection_count}"
                        echo -e "${orange}│${normal} LOG COUNT: ${log_count[$user]}"
                        echo -e "${orange}├───────────────────────────────────────┤${normal}"
                        echo -e "${orange}│ ${bright_green}IP LIST:${normal}"
                    fi
                    if [[ "$ip_address" == "127.0.0.1" ]]; then
                        asn="Localhost"
                    else
                        asn=$(whois ${ip_address} | grep -i "descr" | awk -F: '{print $2}' | grep -v '^$' | head -n 1 | xargs || \
                              echo "Unable to retrieve ASN information")

                        if [[ -z $asn ]]; then
                            asn="ISP is not identified"
                        fi
                    fi
                    echo -e "${orange}│   ${normal}${ip_address} » ${asn}"
                    previous_user="$user"
                fi
            fi
        done < /tmp/rotation_trojan
        echo -e "${orange}└───────────────────────────────────────┘${normal}"
        echo ""
    else
        echo -e "   ${orange}No active connections at the moment.${normal}"
    fi

    echo ""
}
check_trojan
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
