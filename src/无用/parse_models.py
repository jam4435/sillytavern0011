import re, json

with open('aa_models_rsc.txt', 'r', encoding='utf-8') as f:
    raw = f.read()

# Find models array in the highlight chart section
pos = raw.find('"models":[', 673500)
print(f'Models array at position: {pos}')

# Extract the entire array
arr_start = raw.index('[', pos) + 1

# Find matching ]
depth = 1
end = arr_start
while depth > 0 and end < len(raw):
    if raw[end] == '[':
        depth += 1
    elif raw[end] == ']':
        depth -= 1
    end += 1

arr_text = raw[arr_start-1:end]  # include the []
print(f'Array length: {len(arr_text)} chars')

# Unescape RSC format
backslash = chr(92)
quote = chr(34)
unescaped = arr_text.replace(backslash + quote, quote)
unescaped = unescaped.replace(backslash + backslash, backslash)

print(f'First 500 chars after unescape:')
print(unescaped[:500])
print()

# Try to parse as JSON
try:
    data = json.loads(unescaped)
    print(f'Successfully parsed! Array has {len(data)} items')
    if len(data) > 0:
        print(f'First item keys ({len(data[0])}): {sorted(data[0].keys())}')
        print()
        print('First item values (non-nested):')
        for k, v in sorted(data[0].items()):
            if not isinstance(v, (dict, list)):
                print(f'  {k}: {v}')
        print()
        # Print all model short_names with their intelligence_index
        print('Models in this array:')
        for i, item in enumerate(data):
            sn = item.get('short_name', item.get('additional_text', 'N/A'))
            ii = item.get('intelligence_index', 'N/A')
            ai = item.get('agentic_index', 'N/A')
            ci = item.get('coding_index', 'N/A')
            print(f'  [{i}] {sn}: II={ii}, AI={ai}, CI={ci}')
except Exception as e:
    print(f'JSON parse error: {e}')
    err_pos = getattr(e, 'pos', 0)
    if err_pos:
        print(f'Around position {err_pos}:')
        print(unescaped[max(0,err_pos-200):err_pos+200])
