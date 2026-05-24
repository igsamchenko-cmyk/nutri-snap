with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

bad_string = 'return (`,StartLine:1629,TargetContent:'
if bad_string in content:
    content = content.replace(bad_string, 'return (')
    with open('src/App.jsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Success: App.jsx cleaned up!")
else:
    print("Error: bad string not found!")
