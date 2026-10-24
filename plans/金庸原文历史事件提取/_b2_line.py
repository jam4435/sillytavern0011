
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
lines = open(r"F:\Develop\AI\sillytavern\plans\金庸原文历史事件提取\\原文UTF8\\天龙八部.txt", encoding="utf-8").read().split("\n")
for n in [8491,11201,11739,11741,11588,11925,11819,13170]:
    print(n, "|", lines[n-1])
