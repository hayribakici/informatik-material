def convertToByteArray(byte_code):
    byte_array = []
    for b in byte_code:
        i = int(b)
        if i == 0 or i == 1:
            byte_array.append(i)
    return byte_array

byte_code = input('Bitte 8 Bits angeben')
if (len(byte_code) < 8):
    print('Zu wenige Bits angegeben.')
    exit(1)
elif (len(byte_code) > 8):
    print('zu viele Bits angegeben')
    exit(1)

byte_list = convertToByteArray(byte_code)
c = chr()
print(byte_list)

