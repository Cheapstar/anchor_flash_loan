import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FlashLoan } from "../target/types/flash_loan";
import idl from "../target/idl/flash_loan.json";

import {
  ACCOUNT_SIZE,
  AccountLayout,
  getAssociatedTokenAddress,
  MINT_SIZE,
  MintLayout,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import { LiteSVM } from "litesvm";
import { BN } from "bn.js";
const programId = new PublicKey("EWAgQvYgjVSHnKpdcDUvkVVnPgttURFFMrJUiKEg73WJ");
/*
    pub borrower:Signer<'info>,    
    pub protocol:SystemAccount<'info>,         
    pub mint:Account<'info,Mint>,                
    pub borrower_ata:Account<'info,TokenAccount>,
    pub protocol_ata:Account<'info,TokenAccount>,

    /// CHECK: InstructionsSysvar account
    pub instructions: UncheckedAccount<'info>,          
    
    pub token_program:Program<'info,Token>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub system_program:Program<'info,System>,
 */
describe("Does it Work or not", () => {
  it("Work or not", async () => {
    const svm = new LiteSVM();
    const provider = anchor.AnchorProvider.local();
    anchor.setProvider(provider);

    // loading the program into the environment , we know this
    svm.addProgramFromFile(programId, "./target/deploy/anchor_flash_loan.so");

    // program Builder
    const program = new anchor.Program<FlashLoan>(idl, provider);

    const tx = new Transaction();

    tx.recentBlockhash = svm.latestBlockhash();

    // create the user
    let borrower = Keypair.generate();
    // adding the account to the svm
    svm.setAccount(borrower.publicKey, {
      lamports: 100_000_000,
      data: Buffer.alloc(0),
      owner: SystemProgram.programId,
      executable: false,
    });

    // creating the protocol
    let seeds = new Uint8Array(Buffer.from("protocol"));
    let [protocol, bump] = PublicKey.findProgramAddressSync([seeds], programId);
    svm.setAccount(protocol, {
      lamports: 100_000_000,
      data: Buffer.alloc(0),
      owner: SystemProgram.programId,
      executable: false,
    });

    // creating the Mint
    let mint = Keypair.generate();

    let mintData = Buffer.alloc(MINT_SIZE);

    // ye jhanjat isliye h kyunki you are doing it from scratch and in the litesSVM
    MintLayout.encode(
      {
        mintAuthorityOption: 1,
        mintAuthority: borrower.publicKey,
        supply: BigInt(0),
        decimals: 0,
        isInitialized: true,
        freezeAuthorityOption: 0,
        freezeAuthority: PublicKey.default,
      },
      mintData
    );

    const mintRent = svm.minimumBalanceForRentExemption(BigInt(MINT_SIZE));

    svm.setAccount(mint.publicKey, {
      lamports: Number(mintRent),
      data: mintData,
      owner: TOKEN_PROGRAM_ID,
      executable: false,
    });

    // ab Ata's
    const borrower_ata = await getAssociatedTokenAddress(
      mint.publicKey,
      borrower.publicKey
    );
    const tokenAccountData = Buffer.alloc(ACCOUNT_SIZE);
    AccountLayout.encode(
      {
        mint: mint.publicKey,
        owner: borrower.publicKey,
        amount: BigInt(100),
        delegateOption: 0,
        delegate: PublicKey.default,
        delegatedAmount: BigInt(0),
        state: 1,
        isNativeOption: 0,
        isNative: BigInt(0),
        closeAuthorityOption: 0,
        closeAuthority: PublicKey.default,
      },
      tokenAccountData
    );

    const tokenRent = svm.minimumBalanceForRentExemption(BigInt(ACCOUNT_SIZE));

    svm.setAccount(borrower_ata, {
      lamports: Number(tokenRent),
      data: tokenAccountData,
      owner: TOKEN_PROGRAM_ID,
      executable: false,
    });

    // protocol_ata
    const protocol_ata = await getAssociatedTokenAddress(
      mint.publicKey,
      protocol,
      true
    );
    AccountLayout.encode(
      {
        mint: mint.publicKey,
        owner: protocol,
        amount: BigInt(100_000_000),
        delegateOption: 0,
        delegate: PublicKey.default,
        delegatedAmount: BigInt(0),
        state: 1,
        isNativeOption: 0,
        isNative: BigInt(0),
        closeAuthorityOption: 0,
        closeAuthority: PublicKey.default,
      },
      tokenAccountData
    );

    svm.setAccount(protocol_ata, {
      lamports: Number(tokenRent),
      data: tokenAccountData,
      owner: TOKEN_PROGRAM_ID,
      executable: false,
    });

    // getting the instruction sysvar
    svm.withSysvars();

    // let's send the instruction and check
    const borrow_amount = new BN(100_00);
    let borrow_ix = await program.methods
      .borrow(borrow_amount)
      .accounts({
        borrower: borrower.publicKey,
        protocol: protocol,
        mint: mint.publicKey,
        borrowerAta: borrower_ata,
        protocolAta: protocol_ata,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    tx.add(borrow_ix);

    let repay_ix = await program.methods
      .repay()
      .accounts({
        borrower: borrower.publicKey,
        protocol: protocol,
        mint: mint.publicKey,
        borrowerAta: borrower_ata,
        protocolAta: protocol_ata,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    tx.add(repay_ix);

    tx.sign(borrower);

    const result = svm.sendTransaction(tx);

    console.log(result.toString());
  });
});
