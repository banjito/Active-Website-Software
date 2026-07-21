#!/usr/bin/env python3
"""
Parse an SKM PowerTools (PTW) protective-device library (PTW.LIB) into newline-delimited
JSON for loading into common.device_catalog (see database/migrations/create_device_catalog_table.sql).

The .LIB is an undocumented binary. Reverse-engineered layout: the file is a flat stream of
tag-length-value fields. Every field ends its header with the bytes `01 01`, immediately
preceded by a uint16 little-endian length, then `length` bytes of latin1 text. A field is a
record *continuation* when the byte before the length is 0xFF; otherwise it starts a new record.
The first field of a record is a composite "<CC><MANUF><catalog...>" where CC is a 2-letter
device-class code (DB=breaker, FU/FL/DF=fuse, RM/RE/ST=relay, MC=molded case, GF=ground fault,
MP=motor protection, ...). Continuation fields carry manufacturer, rating, series, model,
notes, PTW category path, and created/modified dates.

Only nameplate/catalog fields are extracted here. TCC (time-current curve) point arrays live in
separate binary blocks and are NOT decoded.

Usage:  python3 scripts/parse_ptw_lib.py PTW.LIB > device_catalog.ndjson
"""
import sys, struct, re, json, hashlib

DATE = re.compile(r'^\d{1,2}/\d{1,2}/\d{4}\b.*')

def is_category(f: str) -> bool:
    return (' - ' in f) and any(w in f for w in (
        'Device', 'Breaker', 'Relay', 'Fuse', 'Motor', 'Transformer',
        'Ground', 'Overload', 'Meter', 'Voltage', 'Cable', 'Generator'))

def decode(text: bytes) -> str:
    return text.split(b'\x00')[0].decode('latin1', 'replace')

def parse(path: str):
    data = open(path, 'rb').read()

    # 1) pull every TLV field, tagging record-continuations (preceded by 0xFF)
    raw = []
    for m in re.finditer(rb'\x01\x01', data):
        hp = m.start(); lp = hp - 2
        if lp < 1:
            continue
        ln = struct.unpack_from('<H', data, lp)[0]
        if not (2 <= ln <= 4000):
            continue
        t = decode(data[hp + 2: hp + 2 + ln])
        if len(t) < 2 or not t.isprintable():
            continue
        raw.append((data[lp - 1] == 0xFF, t))

    # 2) group fields into records
    records, cur = [], None
    for cont, t in raw:
        if not cont:
            if cur:
                records.append(cur)
            cur = [t]
        elif cur is not None:
            cur.append(t)
    if cur:
        records.append(cur)

    # 3) shape + dedup
    seen = set()
    for r in records:
        m = re.match(r'^([A-Z]{2})([A-Z0-9 ].{1,})$', r[0], re.S)
        if not m:
            continue
        cls, fields = m.group(1), r[1:]
        if not fields:
            continue
        manuf = fields[0].strip()
        if not re.search(r'[A-Za-z]{2}', manuf):        # drop numeric/noise "manufacturers"
            continue
        rest = fields[1:]
        cat = next((f for f in rest if is_category(f)), '')
        dates = [f for f in rest if DATE.match(f)]
        attrs = [f for f in rest if f != cat and not DATE.match(f)]
        rating = attrs[0] if len(attrs) > 0 else None
        series = attrs[1] if len(attrs) > 1 else None
        model  = attrs[2] if len(attrs) > 2 else None
        notes  = ' | '.join(attrs[3:]) if len(attrs) > 3 else None
        display = ' '.join(x for x in (manuf, series, rating) if x).strip()[:300]

        dedup_key = hashlib.md5(
            ('\x1f'.join([cls, m.group(2).strip(), manuf])).encode('utf-8')).hexdigest()
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        yield {
            'dedup_key': dedup_key,
            'device_class': cls,
            'manufacturer': manuf,
            'display_name': display,
            'rating': rating,
            'series': series,
            'model_code': model,
            'notes': notes,
            'ptw_category': cat or None,
            'source': 'PTW.LIB',
            'source_modified': dates[-1] if dates else None,
            'raw_fields': fields,
        }

def main():
    if len(sys.argv) != 2:
        sys.exit('usage: parse_ptw_lib.py PTW.LIB > device_catalog.ndjson')
    n = 0
    for row in parse(sys.argv[1]):
        sys.stdout.write(json.dumps(row, ensure_ascii=False) + '\n')
        n += 1
    sys.stderr.write(f'parsed {n} devices\n')

if __name__ == '__main__':
    main()
