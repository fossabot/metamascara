import { IAddNetworkInfo } from '../interfaces/add-network-info.interface';
import { BigNumberFactory } from '../factories/big-number-factory';
import { IMetamascaraPlugin } from '../interfaces/plugins/metamascara-plugin.interface';
import { IBlockchainInfo } from '../interfaces/blockchain-info.interface';
import { IBlockchainListPlugin } from '../interfaces/plugins/blockchain-list.plugin.interface';

export class MetaMascara {
  private accounts: string[] | null = null;
  private selectedAccount: string | null = null;
  private web3: any = null;
  private provider: any = null;
  private _networkId = 0;
  private _blockchains: Record<number, IBlockchainInfo> = {};

  constructor(private web3Factory: (provider: any) => any, private detectEthereumProvider: () => Promise<any>) {
    if (!this.web3Factory || !this.detectEthereumProvider) {
      throw new Error('web3Factory and detectEthereumProvider are required');
    }

    if (this.web3Factory.prototype && this.web3Factory.prototype.constructor) {
      const Web3: any = this.web3Factory;
      this.web3Factory = m => new Web3(m);
    }
  }

  get isConnected() {
    return !!this.selectedAccount;
  }

  get address(): string | null {
    return this.selectedAccount;
  }

  get networkId(): number {
    return this._networkId;
  }

  get networkName(): string {
    const info = this._blockchains[this._networkId];
    if (!info) {
      return 'Unknown';
    }

    return info.name;
  }

  get blockchains() {
    return this._blockchains;
  }

  get blockchainsList() {
    return Object.keys(this._blockchains).map(key => this._blockchains[+key]);
  }

  async connect() {
    const provider = await this.connectProvider();
    if (!provider) {
      return false;
    }

    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      return false;
    }

    this.provider = provider;
    this.web3 = this.web3Factory(provider);
    this._networkId = await this.web3.eth.net.getId();
    this.accounts = accounts;
    this.selectedAccount = accounts[0];

    return true;
  }

  async addNetwork(info: IAddNetworkInfo) {
    const numericChainId = parseInt(info.chainId, 16);
    if (this.networkId === numericChainId) {
      return true;
    }

    try {
      await this.provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: info.chainId }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        await this.provider.request({ method: 'wallet_addEthereumChain', params: [info] });
      }
      else {
        throw switchError;
      }
    }

    return true;
  }

  disconnect() {
    this.disposeWeb3();
    this.disposeProvider();
  }

  getContract(address: string, abi: any): any {
    if (!address || address === '-') {
      throw new Error('Wrong contract address: ' + address);
    }

    const contract = new this.web3.eth.Contract(abi, address);
    return contract;
  }

  async getBnbBalance(address: string) {
    const ethBalance = await this.web3.eth.getBalance(address);
    return BigNumberFactory.newInstance(ethBalance);
  }

  async getNonce(addr: string) {
    const count = await this.web3.eth.getTransactionCount(addr);
    return +count;
  }

  toHex(x: any): string {
    return this.web3.utils.toHex(x);
  }

  toWei(value: any, unit: string): string {
    return this.web3.utils.toWei(value, unit);
  }

  addPlugin(plugin: IMetamascaraPlugin) {
    switch (plugin.getPluginType()) {
      case 'blockchain-list':
        {
          const newBlockchains = (plugin as IBlockchainListPlugin).getBlockchains();
          for (const blockchain of newBlockchains) {
            this._blockchains[blockchain.id] = blockchain;
          }
        }
        break;
    }
  }

  private async connectProvider() {
    const provider = await this.detectEthereumProvider();

    provider.on('chainChanged', () => {
      this.reload();
    });

    provider.on('accountsChanged', () => {
      this.reload();
    });

    provider.on('disconnect', () => {
      this.reload();
    });

    return provider;
  }

  private disposeProvider(): void {
    if (this.provider && this.provider.close) {
      this.provider.close();
      this.provider = null;
    }
  }

  private disposeWeb3(): void {
    if (this.web3) {
      if (this.web3.eth && this.web3.eth.clearSubscriptions) {
        this.web3.eth.clearSubscriptions();
      }

      this.web3 = null;
    }
  }

  private reload() {
    location.reload();
  }
}