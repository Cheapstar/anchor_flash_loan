import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FlashLoan } from "../target/types/flash_loan";

import {
  createAssociatedTokenAccountInstruction,
  createMint,
  getAssociatedTokenAddress,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import { ASSOCIATED_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { SYSTEM_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/native/system";

describe("test", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.flash_loan as Program<FlashLoan>;

  let borrower: Keypair;
  let protocol: PublicKey; // this is a PDA
  let mint: PublicKey;
  let borrower_ata: PublicKey;
  let protocol_ata: PublicKey;

  let instructions: PublicKey = SYSVAR_INSTRUCTIONS_PUBKEY;
  let token_program: PublicKey = TOKEN_PROGRAM_ID;
  let associated_token_program: PublicKey = ASSOCIATED_PROGRAM_ID;
  let system_program: PublicKey = SYSTEM_PROGRAM_ID;

  before(async () => {
    // Creating Borrower
    borrower = Keypair.generate();
    await provider.connection.requestAirdrop(
      borrower.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );

    // Creating The Protocol PDA Ix
    [protocol] = PublicKey.findProgramAddressSync(
      [Buffer.from("protocol")],
      program.programId
    );

    await program.methods
      .initialize()
      .accounts({
        protocol: protocol,
        payer: provider.wallet.publicKey,
        systemProgram: system_program,
      })
      .rpc();

    // Creating Mint
    mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      6
    );

    // Creating Token ATA for borrower
    borrower_ata = await getAssociatedTokenAddress(mint, borrower.publicKey);
    const borrower_ata_tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey,
        borrower_ata,
        borrower.publicKey,
        mint
      )
    );

    await provider.sendAndConfirm(borrower_ata_tx, [provider.wallet.payer]);
    // Creating Protocol
    protocol_ata = await getAssociatedTokenAddress(mint, protocol, true);

    const protocol_ata_tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey,
        protocol_ata,
        protocol,
        mint
      )
    );

    await provider.sendAndConfirm(protocol_ata_tx, [provider.wallet.payer]);

    // Accounts Setup Done

    // mint some tokens to protocol ata
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mint,
      protocol_ata,
      provider.wallet.payer,
      400
    );
  });

  it("Program Works Correctly", async () => {
    // 1. Create Borrow Instruction
    // 2. Create Repay Instruction
    // order should be that borrow is the first
    // and repay has to the the last
  });
});
