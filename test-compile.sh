npx tsc --noEmit > tsc_output.txt
cat tsc_output.txt | grep "does not exist on type"
