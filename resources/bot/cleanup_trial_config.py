#!/usr/bin/env python3
import os
import re
from datetime import datetime

CONFIG_FILES = [
    '/etc/xray/vmess/config.json',
    '/etc/xray/vless/config.json',
    '/etc/xray/trojan/config.json'
]

COMMENT_PATTERN = re.compile(r'^\s*###\s+(\S+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s*$')

COMPLETED_SERVICES = {
    '/etc/xray/vmess/config.json': 'vmess@config',
    '/etc/xray/vless/config.json': 'vless@config',
    '/etc/xray/trojan/config.json': 'trojan@config'
}


def parse_expiry(date_part: str, time_part: str):
    try:
        return datetime.strptime(f'{date_part} {time_part}', '%Y-%m-%d %H:%M:%S')
    except ValueError:
        return None


def remove_trailing_commas(text: str) -> str:
    text = re.sub(r',\s*(\]|\})', r'\1', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text


def process_file(path: str):
    try:
        with open(path, 'r', encoding='utf-8') as fh:
            lines = fh.read().splitlines()
    except FileNotFoundError:
        print(f'[WARN] File tidak ditemukan: {path}')
        return
    except Exception as exc:
        print(f'[ERROR] Tidak dapat membaca {path}: {exc}')
        return

    now = datetime.now()
    result_lines = []
    removed = 0
    i = 0
    total = len(lines)

    while i < total:
        line = lines[i]
        match = COMMENT_PATTERN.match(line)
        if match:
            email = match.group(1)
            expiry = parse_expiry(match.group(2), match.group(3))
            if expiry and expiry <= now:
                removed += 1
                i += 1
                # Skip following object line(s) belonging to this email
                while i < total:
                    next_line = lines[i]
                    if '"email"' in next_line and email in next_line:
                        i += 1
                        break
                    i += 1
                continue
            else:
                result_lines.append(line)
                i += 1
                continue
        else:
            result_lines.append(line)
            i += 1

    new_content = remove_trailing_commas('\n'.join(result_lines)).rstrip() + '\n'

    if removed > 0:
        try:
            with open(path, 'w', encoding='utf-8') as fh:
                fh.write(new_content)
            print(f'[INFO] Menghapus {removed} trial expired dari {path}')
            service = COMPLETED_SERVICES.get(path)
            if service:
                os.system(f'systemctl restart {service}')
                print(f'[INFO] Restart service {service}')
        except Exception as exc:
            print(f'[ERROR] Gagal menulis {path}: {exc}')
    else:
        print(f'[INFO] Tidak ada trial expired pada {path}')


def main():
    for cfg in CONFIG_FILES:
        process_file(cfg)


if __name__ == '__main__':
    main()
