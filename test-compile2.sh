npx tsc --noEmit > tsc_output.txt 2>&1
cat tsc_output.txt | grep "does not exist on type"
