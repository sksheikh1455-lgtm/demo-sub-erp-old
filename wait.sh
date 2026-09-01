#!/bin/bash
while true; do
  ps | grep node | grep -v grep
  if [ $? -eq 0 ]; then
    sleep 2
  else
    break
  fi
done
