
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
lines = open(r"F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取\\原文UTF8\\天龙八部.txt", encoding="utf-8").read().split("\n")
for n in [9750,9756,9662,12931,12488,12486,10179,10233,9365]:
    print(n, "|", lines[n-1][:400])
