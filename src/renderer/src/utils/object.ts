function fieldsSelector(obj: object, fields: string[]): object {
  const res: any = {}
  fields.forEach((field) => {
    res[field] = obj[field]
  })

  return res
}

export { fieldsSelector }
