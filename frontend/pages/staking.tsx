import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from '@solana/wallet-adapter-react'
import { Wallet } from '@project-serum/anchor'
import type { NextPage } from 'next'
import { ChangeEvent, Fragment, useEffect, useState } from 'react'
import Layout from '../components/Layout'
import SEO from '../components/SEO'
import { STAKING_PROGRAM } from '@components/constants'
import { PythBalance, StakeAccount, StakeConnection } from 'pyth-staking-api'
import { getPythTokenBalance } from './api/getPythTokenBalance'
import toast from 'react-hot-toast'
import { Dialog, Disclosure, Listbox, Tab, Transition } from '@headlessui/react'
import { CheckIcon, ChevronUpIcon, SelectorIcon } from '@heroicons/react/solid'
import { WalletModalButton } from '@solana/wallet-adapter-react-ui'
import { classNames } from 'utils/classNames'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'
import BN from 'bn.js'
import Tooltip from '@components/Tooltip'
import { useRouter } from 'next/router'

enum TabEnum {
  Lock,
  Unlock,
  Withdraw,
}

const tabDescriptions = {
  Lock: 'Deposit and lock PYTH. Locking tokens enables you to participate in Pyth Network governance. Newly-locked tokens become eligible to vote in governance at the beginning of the next epoch.',
  Unlock:
    'Unlock PYTH. Unlocking tokens enables you to withdraw them from the program after a cooldown period of two epochs. Unlocked tokens cannot participate in governance.',
  Withdraw:
    'Withdraw PYTH. Transfer any unlocked tokens from the program to your wallet.',
}

const Staking: NextPage = () => {
  const { connection } = useConnection()
  const anchorWallet = useAnchorWallet()
  const { publicKey, connected } = useWallet()
  const { isReady } = useRouter()
  const [
    isMultipleStakeAccountsModalOpen,
    setIsMultipleStakeAccountsModalOpen,
  ] = useState<boolean>(false)
  const [
    isVestingAccountWithoutGovernanceModalOpen,
    setIsVestingAccountWithoutGovernanceModalOpen,
  ] = useState<boolean>(false)
  const [isLockedModalOpen, setIsLockedModalOpen] = useState<boolean>(false)
  const [isUnlockedModalOpen, setIsUnlockedModalOpen] = useState<boolean>(false)
  const [isUnvestedModalOpen, setIsUnvestedModalOpen] = useState<boolean>(false)
  const [
    isVestingAccountWithoutGovernance,
    setIsVestingAccountWithoutGovernance,
  ] = useState<boolean>(false)
  const [
    multipleStakeAccountsModalOption,
    setMultipleStakeAccountsModalOption,
  ] = useState<StakeAccount>()
  const [isBalanceLoading, setIsBalanceLoading] = useState<boolean>(false)
  const [isSufficientBalance, setIsSufficientBalance] = useState<boolean>(true)
  const [stakeConnection, setStakeConnection] = useState<StakeConnection>()
  const [stakeAccounts, setStakeAccounts] = useState<StakeAccount[]>([])
  const [mainStakeAccount, setMainStakeAccount] = useState<StakeAccount>()
  const [balance, setBalance] = useState<PythBalance>()
  const [pythBalance, setPythBalance] = useState<PythBalance>(
    new PythBalance(new BN(0))
  )
  const [lockedPythBalance, setLockedPythBalance] = useState<PythBalance>(
    new PythBalance(new BN(0))
  )
  const [unlockedPythBalance, setUnlockedPythBalance] = useState<PythBalance>(
    new PythBalance(new BN(0))
  )
  const [unvestedPythBalance, setUnvestedPythBalance] = useState<PythBalance>(
    new PythBalance(new BN(0))
  )
  const [lockingPythBalance, setLockingPythBalance] = useState<PythBalance>()
  const [unlockingPythBalance, setUnlockingPythBalance] =
    useState<PythBalance>()
  const [amount, setAmount] = useState<string>('')
  const [currentTab, setCurrentTab] = useState<TabEnum>(TabEnum.Lock)
  const [nextVestingAmount, setNextVestingAmount] = useState<PythBalance>(
    new PythBalance(new BN(0))
  )
  const [nextVestingDate, setNextVestingDate] = useState<Date>()
  const [
    isEligibleForPreliminaryUnstaking,
    setIsEligibleForPreliminaryUnstaking,
  ] = useState<boolean>(false)

  // create stake connection and get stake accounts when wallet is connected
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsBalanceLoading(true)
        const stakeConnection = await StakeConnection.createStakeConnection(
          connection,
          anchorWallet as Wallet,
          STAKING_PROGRAM
        )
        setStakeConnection(stakeConnection)
        const stakeAccounts = await stakeConnection.getStakeAccounts(
          (anchorWallet as Wallet).publicKey
        )
        setStakeAccounts(stakeAccounts)
        if (stakeAccounts.length === 1) {
          setMainStakeAccount(stakeAccounts[0])
        } else if (stakeAccounts.length > 1) {
          setIsMultipleStakeAccountsModalOpen(true)
          setMultipleStakeAccountsModalOption(stakeAccounts[0])
        } else {
          setIsBalanceLoading(false);
        }
      } catch (e) {
        toast.error(capitalizeFirstLetter(e.message))
      }
    }
    if (!connected) {
      setStakeConnection(undefined)
      setMainStakeAccount(undefined)
      resetBalance()
    } else {
      initialize()
    }
  }, [connected])

  // check if vesting account without governance exists and refresh balances after getting stake accounts
  useEffect(() => {
    checkVestingAccountWithoutGovernance()
    refreshBalance()
  }, [stakeConnection, mainStakeAccount])

  useEffect(() => {
    if (amount && balance) {
      if (
          PythBalance.fromString(amount) > balance
      ) {
        setIsSufficientBalance(false)
      } else {
        setIsSufficientBalance(true)
      }
    } else {
      setIsSufficientBalance(true)
    }
  }, [amount])

  useEffect(() => {
    const getVestingInfo = async () => {
      if (stakeConnection && mainStakeAccount) {
        const currentTime = await stakeConnection.getTime()
        const nextVestingEvent = mainStakeAccount.getNextVesting(currentTime)
        if (nextVestingEvent) {
          setNextVestingAmount(
            new PythBalance(new BN(nextVestingEvent.amount.toString()))
          )
          setNextVestingDate(new Date(Number(nextVestingEvent.time) * 1000))
          setIsEligibleForPreliminaryUnstaking(
            mainStakeAccount.hasGovernanceExcessPosition(currentTime)
          )
        }
      }
    }
    getVestingInfo()
  }, [unvestedPythBalance])

  // set ui balance amount whenever current tab changes
  useEffect(() => {
    if (connected) {
      switch (currentTab) {
        case TabEnum.Lock:
          setBalance(pythBalance)
          break
        case TabEnum.Unlock:
          setBalance(lockedPythBalance)
          break
        case TabEnum.Withdraw:
          setBalance(unlockedPythBalance)
          break
      }
    } else {
      setBalance(undefined)
    }
  }, [
    currentTab,
    connected,
    pythBalance,
    lockedPythBalance,
    unlockedPythBalance,
  ])

  const resetBalance = () => {
    setPythBalance(new PythBalance(new BN(0)))
    setLockingPythBalance(new PythBalance(new BN(0)))
    setLockedPythBalance(new PythBalance(new BN(0)))
    setUnlockingPythBalance(new PythBalance(new BN(0)))
    setUnvestedPythBalance(new PythBalance(new BN(0)))
    setUnlockedPythBalance(new PythBalance(new BN(0)))
    setNextVestingAmount(new PythBalance(new BN(0)))
  }

  const checkVestingAccountWithoutGovernance = async () => {
    if (
      stakeConnection &&
      mainStakeAccount &&
      mainStakeAccount.isVestingAccountWithoutGovernance(
        await stakeConnection.getTime()
      )
    ) {
      setIsVestingAccountWithoutGovernance(true)
      setIsVestingAccountWithoutGovernanceModalOpen(true)
    }
  }

  // set amount when input changes
  const handleAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    const re = /^(\d*\.)?\d{0,6}$/
    if (re.test(event.target.value)) {
      setAmount(event.target.value)
    }
  }

  // call deposit and lock api when deposit button is clicked (create stake account if not already created)
  const handleDeposit = async () => {
    if (!amount) {
      toast.error('Please enter a valid amount!')
      return
    }
    const depositAmount = PythBalance.fromString(amount)
    if (depositAmount.toBN().gt(new BN(0))) {
      try {
        await stakeConnection?.depositAndLockTokens(
          mainStakeAccount,
          depositAmount
        )
        toast.success(`Deposit and locked ${amount} PYTH tokens!`)
      } catch (e) {
        toast.error(capitalizeFirstLetter(e.message))
      }
      await refreshStakeAccount()
    } else {
      toast.error('Amount must be greater than 0.')
    }
  }

  const handleCloseMultipleStakeAccountsModal = () => {
    setIsMultipleStakeAccountsModalOpen(false)
  }

  const handleCloseVestingAccountWithoutGovernanceModal = () => {
    setIsVestingAccountWithoutGovernanceModalOpen(false)
  }

  // call unlock api when unlock button is clicked
  const handleUnlock = async () => {
    if (!amount) {
      toast.error('Please enter a valid amount!')
      return
    }
    const unlockAmount = PythBalance.fromString(amount)
    if (unlockAmount.toBN().gt(new BN(0))) {
      if (mainStakeAccount) {
        try {
          await stakeConnection?.unlockTokens(mainStakeAccount, unlockAmount)
          toast.success('Unlock successful!')
        } catch (e) {
          toast.error(capitalizeFirstLetter(e.message))
        }
        await refreshStakeAccount()
      } else {
        toast.error('Stake account is undefined.')
      }
    } else {
      toast.error('Amount must be greater than 0.')
    }
  }

  const handleMultipleStakeAccountsConnectButton = () => {
    setMainStakeAccount(multipleStakeAccountsModalOption)
    handleCloseMultipleStakeAccountsModal()
  }

  const handleVestingAccountWithoutGovernanceOptInButton = async () => {
    if (stakeConnection && mainStakeAccount) {
      await stakeConnection.optIntoGovernance(mainStakeAccount)
      setIsVestingAccountWithoutGovernance(false)
      await refreshStakeAccount()
    }
    handleCloseVestingAccountWithoutGovernanceModal()
  }

  const handleVestingAccountWithoutGovernanceNoThanksButton = () => {
    handleCloseVestingAccountWithoutGovernanceModal()
  }

  // withdraw unlocked PYTH tokens to wallet
  const handleWithdraw = async () => {
    if (!amount) {
      toast.error('Please enter a valid amount!')
      return
    }
    const withdrawAmount = PythBalance.fromString(amount)
    if (withdrawAmount.toBN().gt(new BN(0))) {
      if (mainStakeAccount) {
        try {
          await stakeConnection?.withdrawTokens(
            mainStakeAccount,
            withdrawAmount
          )
          toast.success('Withdraw successful!')
        } catch (e) {
          toast.error(capitalizeFirstLetter(e.message))
        }
        await refreshStakeAccount()
      } else {
        toast.error('Stake account is undefined.')
      }
    } else {
      toast.error('Amount must be greater than 0.')
    }
  }

  // refresh balances each time balances change
  const refreshBalance = async () => {
    if (stakeConnection && publicKey && mainStakeAccount) {
      setPythBalance(await getPythTokenBalance(connection, publicKey))
      const { withdrawable, locked, unvested } =
        mainStakeAccount.getBalanceSummary(await stakeConnection.getTime())
      setLockingPythBalance(locked.locking)
      setLockedPythBalance(locked.locked)
      setUnlockingPythBalance(
        new PythBalance(locked.unlocking.toBN().add(locked.preunlocking.toBN()))
      )
      setUnvestedPythBalance(unvested)
      setUnlockedPythBalance(withdrawable)
      setIsBalanceLoading(false)
    }
  }

  const refreshStakeAccount = async () => {
    if (stakeConnection && publicKey) {
      setIsBalanceLoading(true)
      const stakeAccounts = await stakeConnection.getStakeAccounts(publicKey)
      if (stakeAccounts.length === 0) {
        setIsBalanceLoading(false)
      }
      for (const acc of stakeAccounts) {
        if (acc.address.toBase58() === mainStakeAccount?.address.toBase58()) {
          setMainStakeAccount(acc)
        }
      }
    }
  }

  // set current tab value when tab is clicked
  const handleChangeTab = (index: number) => {
    setCurrentTab(index as TabEnum)
  }

  // set input amount to half of pyth balance in wallet
  const handleHalfBalanceClick = () => {
    if (balance) {
      setAmount(new PythBalance(balance.toBN().div(new BN(2))).toString())
    }
  }

  // set input amount to max of pyth balance in wallet
  const handleMaxBalanceClick = () => {
    if (balance) {
      setAmount(balance.toString())
    }
  }

  const openLockedModal = () => {
    setIsLockedModalOpen(true)
  }

  const closeLockedModal = () => {
    setIsLockedModalOpen(false)
  }

  const openUnlockedModal = () => {
    setIsUnlockedModalOpen(true)
  }

  const closeUnlockedModal = () => {
    setIsUnlockedModalOpen(false)
  }

  const openUnvestedModal = () => {
    setIsUnvestedModalOpen(true)
  }

  const closeUnvestedModal = () => {
    setIsUnvestedModalOpen(false)
  }

  const handlePreliminaryUnstakeVestingAccount = async () => {
    if (stakeConnection && mainStakeAccount) {
      try {
        await stakeConnection.unlockBeforeVestingEvent(mainStakeAccount)
        toast.success(
          `${new PythBalance(
            nextVestingAmount.toBN().add(lockedPythBalance.toBN())
          ).toString()} tokens have started unlocking. You will be able to withdraw them after ${nextVestingDate?.toLocaleString()}`
        )
        setIsEligibleForPreliminaryUnstaking(false)
        await refreshStakeAccount()
      } catch (e) {
        toast.error(capitalizeFirstLetter(e.message))
      }
      closeUnvestedModal()
    }
  }

  return (
    <Layout>
      <SEO title={'Staking'} />
      <Transition appear show={isMultipleStakeAccountsModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={() => {}}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-50" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform rounded-2xl border-2 border-purpleHeart bg-jaguar p-10 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-md font-inter font-bold leading-6 text-white"
                  >
                    Select stake account
                  </Dialog.Title>
                  <div className="mt-3">
                    <p className="font-poppins text-sm text-scampi">
                      Please choose the stake account you wish to connect to.
                    </p>
                  </div>
                  <Listbox
                    value={multipleStakeAccountsModalOption}
                    onChange={setMultipleStakeAccountsModalOption}
                  >
                    <div className="relative mt-1">
                      <Listbox.Button className="focus-visible:border-indigo-500 focus-visible:ring-white focus-visible:ring-offset-orange-300 relative my-4 w-full cursor-default rounded-lg bg-cherryPie py-2 pl-3 pr-10 text-left text-white shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-opacity-75 focus-visible:ring-offset-2 sm:text-sm">
                        <span className="block truncate">
                          {multipleStakeAccountsModalOption?.address
                            .toBase58()
                            .slice(0, 8) +
                            '..' +
                            multipleStakeAccountsModalOption?.address
                              .toBase58()
                              .slice(-8)}
                        </span>
                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                          <SelectorIcon
                            className="text-gray-400 h-5 w-5"
                            aria-hidden="true"
                          />
                        </span>
                      </Listbox.Button>
                      <Transition
                        as={Fragment}
                        leave="transition ease-in duration-100"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                      >
                        <Listbox.Options className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-cherryPie py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                          {stakeAccounts.map((acc, idx) => (
                            <Listbox.Option
                              key={idx}
                              className={({ active }) =>
                                `relative cursor-default select-none py-2 pl-10 pr-4 ${
                                  active
                                    ? 'bg-pythPurple text-white'
                                    : 'text-white'
                                }`
                              }
                              value={acc}
                            >
                              {({ selected }) => (
                                <>
                                  <span
                                    className={`block truncate ${
                                      selected ? 'font-medium' : 'font-normal'
                                    }`}
                                  >
                                    {acc.address.toBase58().slice(0, 8) +
                                      '..' +
                                      acc.address.toBase58().slice(-8)}
                                  </span>
                                  {selected ? (
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-white">
                                      <CheckIcon
                                        className="h-5 w-5"
                                        aria-hidden="true"
                                      />
                                    </span>
                                  ) : null}
                                </>
                              )}
                            </Listbox.Option>
                          ))}
                        </Listbox.Options>
                      </Transition>
                    </div>
                  </Listbox>
                  <div className="mt-4">
                    <button
                      type="button"
                      className="border-transparent focus-visible:ring-blue-500 inline-flex justify-center rounded-md border bg-cherryPie px-4 py-2 text-sm font-medium text-white hover:bg-pythPurple focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      onClick={handleMultipleStakeAccountsConnectButton}
                    >
                      Connect
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      <Transition
        appear
        show={isVestingAccountWithoutGovernanceModalOpen}
        as={Fragment}
      >
        <Dialog as="div" className="relative z-10" onClose={() => {}}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-50" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform rounded-2xl border-2 border-purpleHeart bg-jaguar p-10 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-md font-inter font-bold leading-6 text-white"
                  >
                    Enroll in governance
                  </Dialog.Title>
                  <div className="mt-3 mb-10 space-y-4">
                    <p className="font-poppins text-sm text-scampi">
                      Your vesting account is not enrolled in governance.
                    </p>
                    <p className="font-poppins text-sm text-scampi">
                      Participating in governance requires you to lock your
                      unvested tokens. This means that when your tokens vest,
                      you will have to manually unlock them through by
                      interacting with the UI and wait for a one epoch cooldown
                      before being able to withdraw them. Opting into governance
                      is currently irreversible.
                    </p>
                  </div>

                  <div className="space-x-10 text-center">
                    <button
                      type="button"
                      className="border-transparent focus-visible:ring-blue-500 inline-flex justify-center rounded-md border bg-cherryPie px-4 py-2 text-sm font-medium text-white hover:bg-pythPurple focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      onClick={handleVestingAccountWithoutGovernanceOptInButton}
                    >
                      Opt in
                    </button>
                    <button
                      type="button"
                      className="border-transparent focus-visible:ring-blue-500 inline-flex justify-center rounded-md border bg-cherryPie px-4 py-2 text-sm font-medium text-white hover:bg-pythPurple focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      onClick={
                        handleVestingAccountWithoutGovernanceNoThanksButton
                      }
                    >
                      No, thank you
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      <Transition appear show={isLockedModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={() => {}}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-50" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform rounded-2xl border-2 border-purpleHeart bg-jaguar p-10 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-md font-inter font-bold leading-6 text-white"
                  >
                    Locked tokens
                  </Dialog.Title>
                  <div className="mt-3 mb-10 space-y-4">
                    <p className="font-poppins text-sm text-scampi">
                      Locked tokens enables you to participate in Pyth Network
                      governance. Newly-locked tokens become eligible to vote in
                      governance at the beginning of the next epoch.
                    </p>
                    <p className="font-poppins text-sm text-scampi">
                      You currently have {lockedPythBalance?.toString()} locked
                      tokens.
                    </p>
                    {lockingPythBalance &&
                    lockingPythBalance.toString() !== '0' ? (
                      <p className="font-poppins text-sm text-scampi">
                        {lockingPythBalance.toString()} tokens will be locked
                        from the beginning of the next epoch.
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="border-transparent focus-visible:ring-blue-500 inline-flex justify-center rounded-md border bg-cherryPie px-4 py-2 text-sm font-medium text-white hover:bg-pythPurple focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    onClick={closeLockedModal}
                  >
                    Got it
                  </button>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      <Transition appear show={isUnlockedModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={() => {}}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-50" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform rounded-2xl border-2 border-purpleHeart bg-jaguar p-10 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-md font-inter font-bold leading-6 text-white"
                  >
                    Unlocked tokens
                  </Dialog.Title>
                  <div className="mt-3 mb-10 space-y-4">
                    <p className="font-poppins text-sm text-scampi">
                      Unlocking tokens enables you to withdraw them from the
                      program after a cooldown period of two epochs of which
                      they become unlocked tokens. Unlocked tokens cannot
                      participate in governance.
                    </p>
                    <p className="font-poppins text-sm text-scampi">
                      You currently have {unlockedPythBalance?.toString()}{' '}
                      unlocked tokens.
                    </p>
                    {unlockingPythBalance &&
                    unlockingPythBalance.toString() !== '0' ? (
                      <p className="font-poppins text-sm text-scampi">
                        {unlockingPythBalance.toString()} tokens have to go
                        through a cool-down period for 2 epochs before they can
                        be withdrawn.
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="border-transparent focus-visible:ring-blue-500 inline-flex justify-center rounded-md border bg-cherryPie px-4 py-2 text-sm font-medium text-white hover:bg-pythPurple focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    onClick={closeUnlockedModal}
                  >
                    Got it
                  </button>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      <Transition appear show={isUnvestedModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={() => {}}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-50" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform rounded-2xl border-2 border-purpleHeart bg-jaguar p-10 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-md font-inter font-bold leading-6 text-white"
                  >
                    Unvested tokens
                  </Dialog.Title>
                  <div className="mt-3 mb-10 space-y-4">
                    <p className="font-poppins text-sm text-scampi">
                      You currently have {unvestedPythBalance?.toString()}{' '}
                      unvested tokens.{' '}
                      {unvestedPythBalance.toString() !== '0'
                        ? `${nextVestingAmount.toString()} tokens
                      will vest on ${nextVestingDate?.toLocaleString()}.`
                        : null}
                    </p>
                    {unvestedPythBalance.toString() !== '0' ? (
                      <p className="font-poppins text-sm text-scampi">
                        Your unvested tokens are locked in the contract to
                        participate in governance. On vest, they will become
                        locked tokens, which require a 2 epoch cooldown to
                        withdraw.
                      </p>
                    ) : null}
                    {isEligibleForPreliminaryUnstaking ? (
                      <p className="font-poppins text-sm text-scampi">
                        If you would like to withdraw them immediately on vest,
                        you may unlock them now. This action will: <br />
                        (1) unlock all of your currently locked tokens,
                        immediately reducing your governance power, and <br />
                        (2) cause your unvested tokens to become unlocked tokens
                        on vest.
                      </p>
                    ) : null}
                  </div>
                  {isEligibleForPreliminaryUnstaking ? (
                    <div className="space-x-10 text-center">
                      <button
                        type="button"
                        className="border-transparent focus-visible:ring-blue-500 inline-flex justify-center rounded-md border bg-cherryPie px-4 py-2 text-sm font-medium text-white hover:bg-pythPurple focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                        onClick={handlePreliminaryUnstakeVestingAccount}
                      >
                        Unlock
                      </button>
                      <button
                        type="button"
                        className="border-transparent focus-visible:ring-blue-500 inline-flex justify-center rounded-md border bg-cherryPie px-4 py-2 text-sm font-medium text-white hover:bg-pythPurple focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                        onClick={closeUnvestedModal}
                      >
                        No, thank you
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="border-transparent focus-visible:ring-blue-500 inline-flex justify-center rounded-md border bg-cherryPie px-4 py-2 text-sm font-medium text-white hover:bg-pythPurple focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      onClick={closeUnvestedModal}
                    >
                      Got it
                    </button>
                  )}
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      <div className="mb-20 flex flex-col items-center px-8">
        <div className="mt-2 w-full max-w-xl rounded-xl border-2 border-blueGem bg-jaguar sm:mt-12">
          <div className="mx-auto grid w-full grid-cols-3 text-center sm:text-left">
            {connected ? (
              <button
                className="rounded-xl py-6 hover:bg-[#232239]"
                onClick={openLockedModal}
              >
                <div className="text-white sm:grid sm:grid-cols-2 sm:px-6">
                  <div className="mb-2 flex content-center sm:mr-2 sm:mb-0">
                    <img
                      src="/pyth-coin-logo.svg"
                      className="m-auto h-8 sm:h-12"
                    />
                  </div>
                  <div className="my-auto flex flex-col">
                    <div className="mx-auto flex text-sm font-bold sm:m-0">
                      Locked{' '}
                    </div>
                    {isBalanceLoading ? (
                      <div className="mx-auto h-5 w-14 animate-pulse rounded-lg bg-ebonyClay sm:m-0" />
                    ) : (
                      <div className="mx-auto flex text-sm sm:m-0">
                        {lockedPythBalance?.toString()}{' '}
                        {lockingPythBalance &&
                        lockingPythBalance.toString() !== '0' ? (
                          <div>
                            <Tooltip content="These tokens will be locked from the beginning of the next epoch.">
                              <div className="mx-1 text-scampi">
                                (+{lockingPythBalance.toString()})
                              </div>
                            </Tooltip>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ) : (
              <div className="py-6 text-white sm:grid sm:grid-cols-2 sm:px-6">
                <div className="mb-2 flex content-center sm:mr-2 sm:mb-0">
                  <img
                    src="/pyth-coin-logo.svg"
                    className="m-auto h-8 sm:h-12"
                  />
                </div>
                <div className="my-auto flex flex-col">
                  <div className="mx-auto flex text-sm font-bold sm:m-0">
                    Locked
                  </div>
                  <div className="mx-auto flex text-sm sm:m-0">-</div>
                </div>
              </div>
            )}
            {connected ? (
              <button
                className="rounded-xl py-6 hover:bg-[#232239]"
                onClick={openUnlockedModal}
              >
                <div className="text-white sm:grid sm:grid-cols-2 sm:px-6">
                  <div className="mb-2 flex content-center sm:mr-2 sm:mb-0">
                    <img
                      src="/pyth-coin-logo.svg"
                      className="m-auto h-8 sm:h-12"
                    />
                  </div>
                  <div className="my-auto flex flex-col">
                    <div className="mx-auto flex text-sm font-bold sm:m-0">
                      Unlocked{' '}
                    </div>
                    {isBalanceLoading ? (
                      <div className="mx-auto h-5 w-14 animate-pulse rounded-lg bg-ebonyClay sm:m-0" />
                    ) : (
                      <div className="mx-auto flex text-sm sm:m-0">
                        {unlockedPythBalance?.toString()}{' '}
                        {unlockingPythBalance &&
                        unlockingPythBalance.toString() !== '0' ? (
                          <div>
                            <Tooltip content="These tokens have to go through a cool-down period for 2 epochs before they can be withdrawn.">
                              <div className="mx-1 text-scampi">
                                (+{unlockingPythBalance.toString()})
                              </div>
                            </Tooltip>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ) : (
              <div className="py-6 text-white sm:grid sm:grid-cols-2 sm:px-6">
                <div className="mb-2 flex content-center sm:mr-2 sm:mb-0">
                  <img
                    src="/pyth-coin-logo.svg"
                    className="m-auto h-8 sm:h-12"
                  />
                </div>
                <div className="my-auto flex flex-col">
                  <div className="mx-auto flex text-sm font-bold sm:m-0">
                    Unlocked
                  </div>
                  <div className="mx-auto flex text-sm sm:m-0">-</div>
                </div>
              </div>
            )}
            {connected ? (
              <button
                className="rounded-xl py-6 hover:bg-[#232239]"
                onClick={openUnvestedModal}
              >
                <div className="text-white sm:grid sm:grid-cols-2 sm:px-6">
                  <div className="mb-2 flex content-center sm:mr-2 sm:mb-0">
                    <img
                      src="/pyth-coin-logo.svg"
                      className="m-auto h-8 sm:h-12"
                    />
                  </div>
                  <div className="my-auto flex flex-col">
                    <div className="mx-auto flex text-sm font-bold sm:m-0">
                      Unvested
                    </div>
                    {isBalanceLoading ? (
                      <div className="mx-auto h-5 w-14 animate-pulse rounded-lg bg-ebonyClay sm:m-0" />
                    ) : (
                      <div className="mx-auto flex text-sm sm:m-0">
                        {unvestedPythBalance?.toString()}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ) : (
              <div className="py-6 text-white sm:grid sm:grid-cols-2 sm:px-6">
                <div className="mb-2 flex content-center sm:mr-2 sm:mb-0">
                  <img
                    src="/pyth-coin-logo.svg"
                    className="m-auto h-8 sm:h-12"
                  />
                </div>
                <div className="my-auto flex flex-col">
                  <div className="mx-auto flex text-sm font-bold sm:m-0">
                    Unvested
                  </div>
                  <div className="mx-auto flex text-sm sm:m-0">-</div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="mt-2 w-full max-w-xl rounded-xl border-2 border-blueGem bg-jaguar px-5 sm:px-14">
          <div className="w-full py-8 font-inter">
            <Tab.Group onChange={handleChangeTab}>
              <Tab.List className="flex justify-center space-x-2">
                {Object.values(TabEnum)
                  .slice(3)
                  .map((v) => (
                    <Tab
                      key={v}
                      className={({ selected }) =>
                        classNames(
                          'py-2.5 px-5 text-xs font-semibold sm:text-sm',

                          selected
                            ? 'primary-btn text-white'
                            : 'text-blue-100 hover:bg-white/[0.12] text-scampi hover:text-white'
                        )
                      }
                    >
                      {TabEnum[v as keyof typeof TabEnum]}
                    </Tab>
                  ))}
              </Tab.List>
              <Tab.Panels className="mt-4 sm:mt-12">
                {isReady &&
                  Object.keys(TabEnum)
                    .slice(3)
                    .map((v, idx) => (
                      <Tab.Panel key={idx}>
                        <div className="col-span-12 text-xs leading-5">
                          <div className="mb-4 h-24 font-poppins text-white sm:mb-12 sm:h-16">
                            {tabDescriptions[v as keyof typeof TabEnum]}
                          </div>
                          <div className="mb-2 flex">
                            <div className="ml-auto mr-0 space-x-2 sm:hidden">
                              <button
                                className="outlined-btn"
                                onClick={handleHalfBalanceClick}
                              >
                                Half
                              </button>
                              <button
                                className="outlined-btn"
                                onClick={handleMaxBalanceClick}
                              >
                                Max
                              </button>
                            </div>
                          </div>
                          <div className="mb-4 flex items-center justify-between font-poppins">
                            <label
                              htmlFor="amount"
                              className="block text-white"
                            >
                              Amount (PYTH)
                            </label>
                            <div className="ml-auto mr-0 flex items-center space-x-2">
                              {isBalanceLoading ? (
                                <div className="h-5 w-14 animate-pulse rounded-lg bg-ebonyClay" />
                              ) : (
                                <p className="text-white">
                                  {currentTab === TabEnum.Lock
                                    ? 'Balance'
                                    : currentTab === TabEnum.Unlock
                                    ? 'Locked Tokens'
                                    : 'Withdrawable'}
                                  : {balance?.toString()}
                                </p>
                              )}
                              <div className="hidden space-x-2 sm:flex">
                                <button
                                  className="outlined-btn hover:bg-valhalla"
                                  onClick={handleHalfBalanceClick}
                                >
                                  Half
                                </button>
                                <button
                                  className="outlined-btn hover:bg-valhalla"
                                  onClick={handleMaxBalanceClick}
                                >
                                  Max
                                </button>
                              </div>
                            </div>
                          </div>
                          <input
                            type="text"
                            name="amount"
                            id="amount"
                            autoComplete="amount"
                            value={amount}
                            onChange={handleAmountChange}
                            className="input-no-spin mt-1 mb-8 block h-14 w-full rounded-full bg-valhalla px-4 text-lg font-semibold text-white focus:outline-none"
                          />
                          <div className="flex items-center justify-center font-inter">
                            {!connected ? (
                              <WalletModalButton
                                className="primary-btn py-3 px-14"
                                text-base
                                font-semibold
                              />
                            ) : currentTab === TabEnum.Lock ? (
                              <button
                                className="primary-btn w-full py-3 px-8 text-base font-semibold text-white hover:bg-blackRussian disabled:bg-bunting"
                                onClick={handleDeposit}
                                disabled={
                                  isVestingAccountWithoutGovernance ||
                                  !isSufficientBalance
                                }
                              >
                                {isVestingAccountWithoutGovernance ? (
                                  <Tooltip content="You are currently not enrolled in governance.">
                                    Lock
                                  </Tooltip>
                                ) : isSufficientBalance ? (
                                  'Lock'
                                ) : (
                                  'Insufficient Balance'
                                )}
                              </button>
                            ) : currentTab === TabEnum.Unlock ? (
                              <button
                                className="primary-btn w-full py-3 px-8 text-base font-semibold text-white hover:bg-blackRussian disabled:bg-bunting"
                                onClick={handleUnlock}
                                disabled={
                                  isVestingAccountWithoutGovernance ||
                                  !isSufficientBalance
                                }
                              >
                                {isVestingAccountWithoutGovernance ? (
                                  <Tooltip content="You are currently not enrolled in governance.">
                                    Unlock
                                  </Tooltip>
                                ) : isSufficientBalance ? (
                                  'Unlock'
                                ) : (
                                  'Insufficient Balance'
                                )}
                              </button>
                            ) : (
                              <button
                                className="primary-btn w-full py-3 px-8 text-base font-semibold text-white hover:bg-blackRussian disabled:bg-bunting"
                                onClick={handleWithdraw}
                                disabled={!isSufficientBalance}
                              >
                                {isSufficientBalance
                                  ? 'Withdraw'
                                  : 'Insufficient Balance'}
                              </button>
                            )}
                          </div>
                        </div>
                      </Tab.Panel>
                    ))}
              </Tab.Panels>
            </Tab.Group>
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default Staking
