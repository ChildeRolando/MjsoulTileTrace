package main

import (
	"bufio"
	"fmt"
	"os"
)

const maxLineBytes = 4 * 1024 * 1024

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 64*1024), maxLineBytes)
	writer := bufio.NewWriter(os.Stdout)
	defer writer.Flush()

	for scanner.Scan() {
		if _, err := writer.Write(handleLine(scanner.Bytes())); err != nil {
			fmt.Fprintf(os.Stderr, "write response: %v\n", err)
			return
		}
		if err := writer.WriteByte('\n'); err != nil {
			fmt.Fprintf(os.Stderr, "write response delimiter: %v\n", err)
			return
		}
		if err := writer.Flush(); err != nil {
			fmt.Fprintf(os.Stderr, "flush response: %v\n", err)
			return
		}
	}

	if err := scanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "read request: %v\n", err)
	}
}
