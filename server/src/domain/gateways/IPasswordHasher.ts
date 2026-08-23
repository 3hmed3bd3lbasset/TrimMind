export interface IPasswordHasher {
  hash(password: string): Promise<string>;
  verify(plainPassword: string, hash?: string): Promise<boolean>;
}
