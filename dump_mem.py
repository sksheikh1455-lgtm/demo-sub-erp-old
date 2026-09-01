import sys, re

pid = sys.argv[1]
maps_file = f"/proc/{pid}/maps"
mem_file = f"/proc/{pid}/mem"

out = open(f"mem_{pid}.dump", "wb")

with open(maps_file, 'r') as map_f, open(mem_file, 'rb', 0) as mem_f:
    for line in map_f.readlines():
        m = re.match(r'([0-9A-Fa-f]+)-([0-9A-Fa-f]+) ([-r])', line)
        if m.group(3) == 'r':
            start = int(m.group(1), 16)
            end = int(m.group(2), 16)
            try:
                mem_f.seek(start)
                chunk = mem_f.read(end - start)
                out.write(chunk)
            except Exception:
                pass
out.close()
