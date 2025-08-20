function remove_empty_strings(arr: string[]) {
  return arr.filter((item: string): boolean => item !== '')
}

export { remove_empty_strings }
